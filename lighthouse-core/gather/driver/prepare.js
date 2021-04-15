/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const log = require('lighthouse-logger');
const pageFunctions = require('../../lib/page-functions.js');

/**
 * @param {LH.Gatherer.FRProtocolSession} session
 * @return {Promise<void>}
 */
function enableRuntimeEvents(session) {
  return session.sendCommand('Runtime.enable');
}

/**
 * @param {LH.Gatherer.FRProtocolSession} session
 * @return {Promise<void>}
 */
async function enableAsyncStacks(session) {
  await session.sendCommand('Debugger.enable');
  await session.sendCommand('Debugger.setSkipAllPauses', {skip: true});
  await session.sendCommand('Debugger.setAsyncCallStackDepth', {maxDepth: 8});
}

/**
 * Use a RequestIdleCallback shim for tests run with simulated throttling, so that the deadline can be used without
 * a penalty
 * @param {LH.Gatherer.FRProtocolSession} session
 * @param {LH.Config.Settings} settings
 * @return {Promise<void>}
 */
async function registerRequestIdleCallbackWrap(session, settings) {
  if (settings.throttlingMethod === 'simulate') {
    const source = `(${pageFunctions.wrapRequestIdleCallbackString})
      (${settings.throttling.cpuSlowdownMultiplier})`;
    await session.sendCommand('Page.addScriptToEvaluateOnNewDocument', {source});
  }
}

/**
 * Dismiss JavaScript dialogs (alert, confirm, prompt), providing a
 * generic promptText in case the dialog is a prompt.
 * @param {LH.Gatherer.FRProtocolSession} session
 * @return {Promise<void>}
 */
async function dismissJavaScriptDialogs(session) {
  session.on('Page.javascriptDialogOpening', data => {
    log.warn('Driver', `${data.type} dialog opened by the page automatically suppressed.`);

    session.sendCommand('Page.handleJavaScriptDialog', {
      accept: true,
      promptText: 'Lighthouse prompt response',
    }).catch(err => log.warn('Driver', err));
  });

  await session.sendCommand('Page.enable');
}


module.exports = {


  enableRuntimeEvents,
  enableAsyncStacks,
  registerRequestIdleCallbackWrap,
  dismissJavaScriptDialogs,
};
