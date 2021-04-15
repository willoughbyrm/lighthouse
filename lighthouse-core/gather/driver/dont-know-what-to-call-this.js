/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/**
 * Return the body of the response with the given ID. Rejects if getting the
 * body times out.
 * @param {string} requestId
 * @param {number} [timeout]
 * @return {Promise<string>}
 */
async function getRequestContent(requestId, timeout = 1000) {
  requestId = NetworkRequest.getRequestIdForBackend(requestId);

  // Encoding issues may lead to hanging getResponseBody calls: https://github.com/GoogleChrome/lighthouse/pull/4718
  // driver.sendCommand will handle timeout after 1s.
  this.setNextProtocolTimeout(timeout);
  const result = await this.sendCommand('Network.getResponseBody', {requestId});
  return result.body;
}

/**
 * Resolves a backend node ID (from a trace event, protocol, etc) to the object ID for use with
 * `Runtime.callFunctionOn`. `undefined` means the node could not be found.
 *
 * @param {number} backendNodeId
 * @return {Promise<string|undefined>}
 */
async function resolveNodeIdToObjectId(backendNodeId) {
  try {
    const resolveNodeResponse = await this.sendCommand('DOM.resolveNode', {backendNodeId});
    return resolveNodeResponse.object.objectId;
  } catch (err) {
    if (
      /No node.*found/.test(err.message) ||
      /Node.*does not belong to the document/.test(err.message)
    ) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Resolves a proprietary devtools node path (created from page-function.js) to the object ID for use
 * with `Runtime.callFunctionOn`. `undefined` means the node could not be found.
 * Requires `DOM.getDocument` to have been called since the object's creation or it will always be `undefined`.
 *
 * @param {string} devtoolsNodePath
 * @return {Promise<string|undefined>}
 */
async function resolveDevtoolsNodePathToObjectId(devtoolsNodePath) {
  try {
    const {nodeId} = await this.sendCommand('DOM.pushNodeByPathToFrontend', {
      path: devtoolsNodePath,
    });

    const {
      object: {objectId},
    } = await this.sendCommand('DOM.resolveNode', {
      nodeId,
    });

    return objectId;
  } catch (err) {
    if (/No node.*found/.test(err.message)) return undefined;
    throw err;
  }
}

/**
 * @param {{x: number, y: number}} position
 * @return {Promise<void>}
 */
function scrollTo(position) {
  const scrollExpression = `window.scrollTo(${position.x}, ${position.y})`;
  return this.executionContext.evaluateAsync(scrollExpression, {useIsolation: true});
}

function getScrollPosition() {
  return this.executionContext.evaluateAsync(`({x: window.scrollX, y: window.scrollY})`, {
    useIsolation: true,
  });
}
