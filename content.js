// content.js — bridge between the extension (sidepanel/background) and the page's MAIN world.
// Runs in the ISOLATED world of the page so it has access to chrome.* APIs.

(function () {
  const SOURCE_PAGE = "WCE_PAGE";
  const SOURCE_EXT = "WCE_EXT";

  // Inject the MAIN-world script that does the actual scanning/freezing.
  function inject() {
    try {
      const url = chrome.runtime.getURL("injected.js");
      const script = document.createElement("script");
      script.src = url;
      script.async = false;
      script.dataset.wce = "1";
      (document.head || document.documentElement).appendChild(script);
      script.addEventListener("load", () => script.remove());
    } catch (err) {
      console.warn("[WebCheatEngine] inject failed:", err);
    }
  }
  inject();

  // Forward messages from the page's MAIN world to the extension.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_PAGE) return;
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
