# AutoTyper Lite

A Chrome extension that simulates human-like typing into any input field or text area on any webpage.

## Features

- **Side Panel UI** - Opens as a side panel for easy access while working
- **Typing Simulation** - Types character-by-character into the focused input field
- **Adjustable Speed** - Slider from 20 WPM to 200 WPM
- **Human-like Randomness** - Adds ±10-30ms random variance between keystrokes
- **Optional Typos** - Occasionally inserts wrong characters then backspaces and corrects
- **Pause/Resume/Stop** - Full control over the typing process
- **Progress Indicator** - Shows characters typed vs total
- **ContentEditable Support** - Works with Gmail, WhatsApp Web, Google Docs, and other rich text editors

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `auto-typer-lite` folder
6. The extension icon will appear in your Chrome toolbar

## Usage

### Opening the Side Panel

1. Click the extension icon in your Chrome toolbar
2. Click the **pin icon** to keep the side panel open
3. Or right-click the extension icon → **Open side panel**

### Typing Text

1. Click inside a text field on any webpage (input, textarea, or rich text editor like Google Docs)
2. Enter your text in the side panel textarea
3. Adjust WPM speed if needed
4. Optionally enable "Include Typos"
5. Click **Start**
6. Watch as the extension types into the focused field

### Debug Tool

If typing doesn't work, use the **Check Field** button in the debug section to see:
- Which element is currently focused
- Whether it's detected as a valid input field
- The element's contentEditable status

## Supported Elements

- `<input type="text">`
- `<input type="password">`
- `<input type="email">`
- `<textarea>`
- ContentEditable divs (Google Docs, Gmail compose, WhatsApp Web, etc.)

## How It Works

The extension:
1. Detects the currently focused input field when you click Start
2. Sends the text and settings to a content script
3. The content script simulates character-by-character input with:
   - Variable delays based on WPM setting
   - Random ±10-30ms variance for human-like feel
   - Optional typo-and-backspace sequences
4. Uses `document.execCommand('insertText')` for contenteditable elements for maximum compatibility
5. Dispatches `input` and `change` events for React/Vue/Angular compatibility

## Files

```
auto-typer-lite/
├── manifest.json       # Extension manifest (Manifest V3)
├── sidepanel.html      # Side panel UI
├── sidepanel.js        # Side panel logic
├── content.js          # Content script for typing simulation
├── background.js       # Service worker for message routing
├── icon.png            # Extension icon
└── README.md           # This file
```

## Permissions

- `storage` - For persisting user settings
- `activeTab` - For accessing the active tab
- `scripting` - For executing content scripts
- `sidePanel` - For opening as a side panel

## Troubleshooting

**"Please click on a text field first"**
- Make sure you've clicked inside a text field before pressing Start
- Use the "Check Field" button to verify the extension can see the element

**Typing doesn't appear in Google Docs**
- Click inside the Google Docs document first
- Make sure the cursor is blinking in the document
- Try clicking directly on the text area in the document

**Extension can't detect the field**
- Refresh the page after loading the extension
- Check the debug section for information about what's detected
