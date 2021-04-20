/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/**
 * @param {[string, string][]} headers
 * @return {string}
 */
function headersParam(headers) {
  const headerString = new URLSearchParams(headers).toString();
  return new URLSearchParams([['extra_header', headerString]]).toString();
}

const superStrictCsp = headersParam([[
  'Content-Security-Policy',
  'default-src \'none\'; sandbox allow-scripts;',
]]);

/**
 * @type {Array<Smokehouse.ExpectedRunnerResult>}
 */
module.exports = [
  {
    artifacts: {
      RobotsTxt: {
        status: 404,
        content: null,
      },
      InspectorIssues: {contentSecurityPolicy: []},
    },
    lhr: {
      requestedUrl: 'http://localhost:10200/csp.html',
      finalUrl: 'http://localhost:10200/csp.html',
      audits: {},
    },
  },
  {
    artifacts: {
      RobotsTxt: {
        status: null,
        content: null,
      },
      InspectorIssues: {
        contentSecurityPolicy: [
          {
            blockedURL: 'http://localhost:10200/robots.txt',
            violatedDirective: 'connect-src',
            isReportOnly: false,
            contentSecurityPolicyViolationType: 'kURLViolation',
          },
          {
            violatedDirective: 'style-src-elem',
            isReportOnly: false,
            contentSecurityPolicyViolationType: 'kInlineViolation',
          },
        ],
      },
    },
    lhr: {
      requestedUrl: 'http://localhost:10200/csp.html?' + superStrictCsp,
      finalUrl: 'http://localhost:10200/csp.html?' + superStrictCsp,
      audits: {},
    },
  },
];
