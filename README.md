# AutoTyper Lite

AutoTyper Lite is a free Manifest V3 Chrome extension that simulates human-like typing into the currently focused text field, textarea, contenteditable editor, or Google Docs surface.

## Permission Audit

The extension declares these permissions in `manifest.json`:

- `scripting`: Injects `content.js` again if Chrome unloads it or a page was opened before installation.
- `activeTab`: Allows access to the current tab after the user opens the extension and starts typing.
- `storage`: Saves the last text, WPM setting, and typo toggle in `chrome.storage.local`.
- `tabs`: Queries the active tab and sends commands/status between the side panel and content script.
- `sidePanel`: Loads AutoTyper Lite in Chrome's side panel instead of a transient popup.

The extension declares these host permissions:

- `https://docs.google.com/*`: Google Docs compatibility.
- `https://mail.google.com/*`: Gmail compose compatibility.
- `https://web.whatsapp.com/*`: WhatsApp Web compatibility.
- `<all_urls>`: Catch-all support for other webpages and iframe-hosted editors.

The content script is declared with `run_at: "document_idle"` and `all_frames: true` so it can run in nested frames, including editors that place their input target inside iframes.

## Files

- `manifest.json`: Chrome MV3 manifest and permission declarations.
- `popup.html`: Side panel UI.
- `popup.js`: Side panel state, storage, active-tab messaging, and reinjection fallback.
- `content.js`: Typing engine and field detection logic.
- `background.js`: Service worker that opens the side panel from the toolbar action and pauses typing when the panel disconnects.

## Load in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `AutoTyper-Lite` folder.
5. Pin the extension if you want quick access from the toolbar.
6. Click the toolbar icon to open AutoTyper Lite in Chrome's side panel.

## Use

1. Click into a text field, textarea, editor, Gmail compose area, WhatsApp message box, or Google Docs document.
2. Open the AutoTyper Lite side panel from the toolbar icon.
3. Paste or type the text to enter.
4. Adjust the WPM slider from 20 to 200 WPM.
5. Optionally enable human-like typo correction.
6. Choose `Light` or `Dark` mode with the theme toggle.
7. Click `Start`.
8. Use `Pause`, `Resume`, or `Stop` from the side panel while typing is active.

If typing is paused, `Resume` continues from the last typed character rather than restarting. If the WPM slider is changed while paused, the new speed is applied when typing resumes.

If the side panel is closed while typing, AutoTyper Lite pauses automatically.

## Notes and Limits

- Chrome blocks extensions from running on internal pages such as `chrome://` pages and the Chrome Web Store.
- Google Docs uses a keyboard-event layer rather than normal input fields, so AutoTyper Lite uses event dispatch only on Docs and never assigns `.value`.
- Some sites intentionally block synthetic input events. The extension uses the safest offline-only approach available to a Chrome extension, but hostile or heavily sandboxed pages may still reject automation.
