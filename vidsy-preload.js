/**
 * vidsy-preload.js
 * Injected into the Vidsy platform BrowserView.
 * Hooks into XHR to detect and report upload progress.
 */
const { ipcRenderer } = require('electron');

// Only run if we are on app.vidsy.co
if (window.location.hostname.includes('vidsy.co')) {
  
  // Monkey-patch XMLHttpRequest to catch progress
  const OriginalXHR = window.XMLHttpRequest;
  
  function NewXHR() {
    const xhr = new OriginalXHR();
    const originalSend = xhr.send;
    
    xhr.send = function(data) {
      // Check if this is an upload (has a body and it's likely a video)
      if (data && (data instanceof FormData || data instanceof Blob)) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            ipcRenderer.send('upload-progress', { percent });
          }
        });
        
        xhr.addEventListener('load', () => {
          ipcRenderer.send('upload-complete');
        });
        
        xhr.addEventListener('error', () => {
          ipcRenderer.send('upload-error', { reason: 'Network error during upload' });
        });
      }
      return originalSend.apply(this, arguments);
    };
    
    return xhr;
  }
  
  // We can't easily replace the global constructor in some environments, 
  // but we can try. Alternatively, use a proxy or just wait for the right events.
  // For now, let's try a simpler approach if possible, but XHR hooking is standard.
  
  // Note: BrowserView doesn't support 'ipc-message' from guest to host as easily as <webview>.
  // In BrowserView, we use ipcRenderer.send and handle it in the main process.
  
  // Re-define XHR
  window.XMLHttpRequest = NewXHR;

  // ─── Monitor for UI success indicators ─────────────────────────────────────
  // Watch the DOM for "Success", "Uploaded", or green checkmarks
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        const text = document.body.innerText;
        if (text.includes('Upload successful') || text.includes('Upload complete') || text.includes('File uploaded')) {
          ipcRenderer.send('upload-complete', { source: 'dom-match' });
        } else if (text.includes('Processing') || text.includes('Transcoding')) {
          ipcRenderer.send('upload-progress', { percent: 100, status: 'PROCESSING' });
        }
        // Optional: stop observing once success is found to save resources
        // observer.disconnect(); 
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // ─── Fetch Hook ────────────────────────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const url = args[0];
    const options = args[1];

    // Detect if this is a likely upload request
    const isUpload = options && (options.method === 'POST' || options.method === 'PUT') && 
                     (options.body instanceof FormData || options.body instanceof Blob);

    if (isUpload) {
      console.log('[vidsy-preload] Upload detected via fetch to:', url);
      ipcRenderer.send('upload-progress', { percent: 10 }); // Signal start
    }

    try {
      const response = await originalFetch(...args);
      if (isUpload && response.ok) {
        ipcRenderer.send('upload-complete', { source: 'fetch' });
      }
      return response;
    } catch (err) {
      if (isUpload) ipcRenderer.send('upload-error', { reason: err.message });
      throw err;
    }
  };
}
