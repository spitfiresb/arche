/* Demo-only shim for the two get-started forms.
 *
 * The shipped site POSTs the form to Formspree, which reaches a real inbox.
 * A portfolio visitor filling it in to see what the second step looks like
 * should not mail anyone, so the action was repointed at a same-origin path
 * that nothing serves, and this answers it 200 locally. The form's own code
 * is untouched: it still validates, still steps, still shows its success
 * state — the request just stops here.
 */
(function () {
  'use strict';
  var ENDPOINT = '/demos/unpak-site/api/demo-form';
  var real = window.fetch;
  window.fetch = function (u, o) {
    if (String(u).indexOf(ENDPOINT) === -1) return real.apply(this, arguments);
    return new Promise(function (resolve) {
      // A beat of latency, so "Sending…" is legible rather than a flicker.
      setTimeout(function () {
        resolve(new Response('{"ok":true}', {
          status: 200, headers: { 'content-type': 'application/json' }
        }));
      }, 550);
    });
  };
})();
