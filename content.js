// content.js — bridge between the extension (sidepanel/background) and the
// page's MAIN world. Runs in the ISOLATED world of the page so it has access
// to chrome.* APIs. The MAIN-world script (injected.js) is loaded directly via
// the manifest's content_scripts entry with world:"MAIN" (and via
// chrome.scripting.executeScript on demand by the side panel) — this file no
// longer touches the DOM, which makes it work on CSP-strict pages too.

(function () {
  if (window.__WCE_BRIDGE_INSTALLED__) return;
  window.__WCE_BRIDGE_INSTALLED__ = true;

  const SOURCE_PAGE = "WCE_PAGE";
  const SOURCE_EXT = "WCE_EXT";

  // Forward unsolicited events from the page's MAIN world to the extension.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_PAGE) return;
    if (data.unsolicited !== true) return;
    try {
      chrome.runtime.sendMessage({
        type: "WCE_FROM_PAGE",
        payload: data.payload,
        requestId: data.requestId,
      });
    } catch (err) {
      // Side panel might not be open; ignore.
    }
  });

  // Forward messages from the extension to the page's MAIN world.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "WCE_TO_PAGE") return false;
    const requestId = msg.requestId || String(Math.random());

    function onReply(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== SOURCE_PAGE) return;
      if (data.requestId !== requestId) return;
      window.removeEventListener("message", onReply);
      sendResponse({ ok: true, payload: data.payload });
    }
    window.addEventListener("message", onReply);

    window.postMessage(
      { source: SOURCE_EXT, requestId, payload: msg.payload },
      "*"
    );

    // Return true to keep the message channel open for async response.
    return true;
  });
})();
