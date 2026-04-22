"use strict";
const { ipcRenderer } = require("electron");
if (window.location.hostname.includes("vidsy.co")) {
  let NewXHR = function() {
    const xhr = new OriginalXHR();
    const originalSend = xhr.send;
    xhr.send = function(data) {
      if (data && (data instanceof FormData || data instanceof Blob)) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percent = Math.round(event.loaded / event.total * 100);
            ipcRenderer.send("upload-progress", { percent });
          }
        });
        xhr.addEventListener("load", () => {
          ipcRenderer.send("upload-complete");
        });
        xhr.addEventListener("error", () => {
          ipcRenderer.send("upload-error", { reason: "Network error during upload" });
        });
      }
      return originalSend.apply(this, arguments);
    };
    return xhr;
  };
  const OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = NewXHR;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" || mutation.type === "characterData") {
        const text = document.body.innerText;
        if (text.includes("Upload successful") || text.includes("Upload complete") || text.includes("File uploaded")) {
          ipcRenderer.send("upload-complete", { source: "dom-match" });
        } else if (text.includes("Processing") || text.includes("Transcoding")) {
          ipcRenderer.send("upload-progress", { percent: 100, status: "PROCESSING" });
        }
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const url = args[0];
    const options = args[1];
    const isUpload = options && (options.method === "POST" || options.method === "PUT") && (options.body instanceof FormData || options.body instanceof Blob);
    if (isUpload) {
      console.log("[vidsy-preload] Upload detected via fetch to:", url);
      ipcRenderer.send("upload-progress", { percent: 10 });
    }
    try {
      const response = await originalFetch(...args);
      if (isUpload && response.ok) {
        ipcRenderer.send("upload-complete", { source: "fetch" });
      }
      return response;
    } catch (err) {
      if (isUpload) ipcRenderer.send("upload-error", { reason: err.message });
      throw err;
    }
  };
}
