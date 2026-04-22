Vidsy Bridge: Headless Upload Utility
Project Objective
To create a high-speed, "stealth" desktop bridge between the macOS Finder and the Vidsy Platform. The app eliminates manual navigation by using filename pattern recognition to automatically route and inject video files into the correct platform curation slots.

Desired UI (ASCII Mockup)
This interface replaces the standard platform view to provide a minimal, single-purpose workspace.


_________________________________________________________________
|                                                               |
|   VIDSY UPLOADER                                   [ READY ]  |
|_______________________________________________________________|
|                                                               |
|    _______________________________________________________    |
|   |                                                       |   |
|   |                                                       |   |
|   |                                                       |   |
|   |            Drag and Drop Files to Upload              |   |
|   |                                                       |   |
|   |                                                       |   |
|   |_______________________________________________________|   |
|                                                               |
|_______________________________________________________________|
| Activity: MIEZ_8368_video.mp4 detected... routing to URL      |
|_______________________________________________________________|
Engineering Worklist
Headless Configuration: Set BrowserView dimensions to 0x0 to run the Vidsy platform invisibly in the background.

Short-Hash Routing: Implement Regex (/^([A-Z]+)_(\d+)/i) to extract project IDs from filenames (e.g., MIEZ_8368).

Automatic URL Construction: Programmatically build target URLs using the pattern https://app.vidsy.co/curation/[BRAND]/

DOM Injection: Upon page load completion, execute a JavaScript payload to find the platform's input[type="file"] and programmatically trigger the upload.

Session Persistence: Utilize persist:vidsy partition to ensure the headless view remains authenticated across restarts.

Project Structure

Vidsy.Uploader/
├── main.js                 # Electron Main Process (Headless routing logic)
├── preload.js              # Secure IPC Bridge
├── forge.config.js         # Build orchestration for Vite + Electron
├── package.json            # Dependency & Build script definitions
├── vite.main.config.mjs    # Vite config for the background engine
├── vite.renderer.config.mjs # Vite config for the Uploader UI
├── index.html              # UI entry shell
├── main.jsx                # React mount point
└── App.jsx                 # Uploader UI (The Drop Zone interface)
Purpose & Step-by-Step Plan
Purpose: To reduce the upload workflow from 5-6 clicks and manual URL navigation down to a single drag-and-drop action directly from the desktop.

Operational Plan:

Step 1 (Setup): User opens the app and performs a one-time login (temporarily widening the window to 800px).

Step 2 (Monitoring): The app runs invisibly in the background, either watching a specific folder or waiting for a drop event.

Step 3 (Recognition): When a file like MIEZ_8368_tiktok_9x16.mp4 is dropped, the app parses the hash MIEZ_8368.

Step 4 (Navigation): The hidden background view navigates to the specific curation page for that hash.

Step 5 (Handshake): Once the page is ready, the app "hands" the local file directly to the web uploader via script injection, starting the upload process automatically.
