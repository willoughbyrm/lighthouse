/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const ByteEfficiencyAudit = require('./byte-efficiency-audit.js');
const JSBundles = require('../../computed/js-bundles.js');
const i18n = require('../../lib/i18n/i18n.js');

const UIStrings = {
  /** Imperative title of a Lighthouse audit that tells the user to remove JavaScript that is never evaluated during page load. This is displayed in a list of audit titles that Lighthouse generates. */
  title: 'Remove unused JavaScript',
  /** Description of a Lighthouse audit that tells the user *why* they should remove JavaScript that is never needed/evaluated by the browser. This is displayed after a user expands the section to see more. No character length limits. 'Learn More' becomes link text to additional documentation. */
  description: 'Remove unused JavaScript to reduce bytes consumed by network activity. ' +
    '[Learn more](https://developers.google.com/web/fundamentals/performance/optimizing-javascript/code-splitting).',
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

const IGNORE_THRESHOLD_IN_BYTES = 2048;

/**
 * @typedef WasteData
 * @property {Uint8Array} unusedByIndex
 * @property {number} unusedLength
 * @property {number} contentLength
 */

class UnusedJavaScript extends ByteEfficiencyAudit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'unused-javascript',
      title: str_(UIStrings.title),
      description: str_(UIStrings.description),
      scoreDisplayMode: ByteEfficiencyAudit.SCORING_MODES.NUMERIC,
      requiredArtifacts: ['JsUsage', 'SourceMaps', 'ScriptElements', 'devtoolsLogs', 'traces'],
    };
  }

  /**
   * @param {LH.Crdp.Profiler.ScriptCoverage} scriptCoverage
   * @return {WasteData}
   */
  static computeWaste(scriptCoverage) {
    let maximumEndOffset = 0;
    for (const func of scriptCoverage.functions) {
      maximumEndOffset = Math.max(maximumEndOffset, ...func.ranges.map(r => r.endOffset));
    }

    // We only care about unused ranges of the script, so we can ignore all the nesting and safely
    // assume that if a range is unexecuted, all nested ranges within it will also be unexecuted.
    const unusedByIndex = new Uint8Array(maximumEndOffset);
    for (const func of scriptCoverage.functions) {
      for (const range of func.ranges) {
        if (range.count === 0) {
          for (let i = range.startOffset; i < range.endOffset; i++) {
            unusedByIndex[i] = 1;
          }
        }
      }
    }

    let unused = 0;
    for (const x of unusedByIndex) {
      unused += x;
    }

    return {
      unusedByIndex,
      unusedLength: unused,
      contentLength: maximumEndOffset,
    };
  }

  /**
   * @param {LH.Audit.ByteEfficiencyItem} item
   * @param {WasteData[]} wasteData
   * @param {LH.Artifacts.Bundle} bundle
   * @param {ReturnType<typeof UnusedJavaScript.determineLengths>} lengths
   */
  static createBundleMultiData(item, wasteData, bundle, lengths) {
    if (!bundle.script.content) return;

    /** @type {Record<string, number>} */
    const files = {};

    const lineLengths = bundle.script.content.split('\n').map(l => l.length);
    let totalSoFar = 0;
    const lineOffsets = lineLengths.map(len => {
      const retVal = totalSoFar;
      totalSoFar += len + 1;
      return retVal;
    });

    // @ts-ignore: We will upstream computeLastGeneratedColumns to CDT eventually.
    bundle.map.computeLastGeneratedColumns();
    for (const mapping of bundle.map.mappings()) {
      let offset = lineOffsets[mapping.lineNumber];

      offset += mapping.columnNumber;
      const lastColumnOfMapping =
        // @ts-ignore: We will upstream lastColumnNumber to CDT eventually.
        (mapping.lastColumnNumber - 1) || lineLengths[mapping.lineNumber];
      for (let i = mapping.columnNumber; i <= lastColumnOfMapping; i++) {
        if (wasteData.every(data => data.unusedByIndex[offset] === 1)) {
          // @ts-ignore
          files[mapping.sourceURL] = (files[mapping.sourceURL] || 0) + 1;
        }
        offset += 1;
      }
    }

    const transferRatio = lengths.transfer / lengths.content;
    const topUnusedFilesSizes = Object.entries(files)
      .filter(([_, unusedBytes]) => unusedBytes * transferRatio >= 1024)
      .sort(([_, unusedBytes1], [__, unusedBytes2]) => unusedBytes2 - unusedBytes1)
      .slice(0, 5)
      .map(([key, unusedBytes]) => {
        return {
          key,
          unused: Math.round(unusedBytes * transferRatio),
          total: Math.round(bundle.sizes.files[key] * transferRatio),
        };
      });

    Object.assign(item, {
      sources: topUnusedFilesSizes.map(d => d.key),
      sourceBytes: topUnusedFilesSizes.map(d => d.total),
      sourceWastedBytes: topUnusedFilesSizes.map(d => d.unused),
    });
  }

  /**
   * @param {WasteData[]} wasteData
   * @param {string} url
   * @param {ReturnType<typeof UnusedJavaScript.determineLengths>} lengths
   * @return {LH.Audit.ByteEfficiencyItem}
   */
  static mergeWaste(wasteData, url, lengths) {
    let unused = 0;
    let content = 0;
    // TODO: this is right for multiple script tags in an HTML document,
    // but may be wrong for multiple frames using the same script resource.
    for (const usage of wasteData) {
      unused += usage.unusedLength;
      content += usage.contentLength;
    }

    const wastedRatio = (unused / content) || 0;
    const wastedBytes = Math.round(lengths.transfer * wastedRatio);

    return {
      url: url,
      totalBytes: lengths.transfer,
      wastedBytes,
      wastedPercent: 100 * wastedRatio,
    };
  }

  /**
   * @param {WasteData[]} wasteData
   * @param {LH.Artifacts.NetworkRequest} networkRecord
   */
  static determineLengths(wasteData, networkRecord) {
    let unused = 0;
    let content = 0;
    // TODO: this is right for multiple script tags in an HTML document,
    // but may be wrong for multiple frames using the same script resource.
    for (const usage of wasteData) {
      unused += usage.unusedLength;
      content += usage.contentLength;
    }
    const transfer = ByteEfficiencyAudit.estimateTransferSize(networkRecord, content, 'Script');

    return {
      content,
      unused,
      transfer,
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {Array<LH.Artifacts.NetworkRequest>} networkRecords
   * @param {LH.Audit.Context} context
   * @return {Promise<ByteEfficiencyAudit.ByteEfficiencyProduct>}
   */
  static async audit_(artifacts, networkRecords, context) {
    const bundles = await JSBundles.request(artifacts, context);

    /** @type {Map<string, Array<LH.Crdp.Profiler.ScriptCoverage>>} */
    const scriptsByUrl = new Map();
    for (const script of artifacts.JsUsage) {
      const scripts = scriptsByUrl.get(script.url) || [];
      scripts.push(script);
      scriptsByUrl.set(script.url, scripts);
    }

    const items = [];
    for (const [url, scriptCoverage] of scriptsByUrl.entries()) {
      const networkRecord = networkRecords.find(record => record.url === url);
      if (!networkRecord) continue;
      const wasteData = scriptCoverage.map(UnusedJavaScript.computeWaste);
      const lengths = UnusedJavaScript.determineLengths(wasteData, networkRecord);
      const bundle = bundles.find(b => b.script.src === url);
      const item = UnusedJavaScript.mergeWaste(wasteData, networkRecord.url, lengths);
      if (item.wastedBytes <= IGNORE_THRESHOLD_IN_BYTES) continue;
      if (bundle) {
        UnusedJavaScript.createBundleMultiData(item, wasteData, bundle, lengths);
      }
      items.push(item);
    }

    return {
      items,
      headings: [
        /* eslint-disable max-len */
        {key: 'url', valueType: 'url', subRows: {key: 'sources', valueType: 'code'}, label: str_(i18n.UIStrings.columnURL)},
        {key: 'totalBytes', valueType: 'bytes', subRows: {key: 'sourceBytes'}, label: str_(i18n.UIStrings.columnSize)},
        {key: 'wastedBytes', valueType: 'bytes', subRows: {key: 'sourceWastedBytes'}, label: str_(i18n.UIStrings.columnWastedBytes)},
        /* eslint-enable max-len */
      ],
    };
  }
}

module.exports = UnusedJavaScript;
module.exports.UIStrings = UIStrings;