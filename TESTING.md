# AutoTyper Lite Testing

## Plain HTML Form

1. Create or open any page with a standard `<input type="text">` and `<textarea>`.
2. Click into the input.
3. Open AutoTyper Lite from the toolbar icon so it appears in Chrome's side panel.
4. Enter sample text, set speed to 80 WPM, and click `Start`.
5. Verify characters appear one-by-one and the progress indicator reaches the total character count.
6. Repeat inside a textarea with multi-line text.
7. Enable typos and verify occasional wrong characters are inserted, backspaced, and corrected.
8. Toggle Light/Dark mode and verify the side panel theme changes and persists after closing and reopening the panel.

Expected result: Standard inputs update via native value setters and dispatch `input` and `change` events, including React-controlled inputs.

## Gmail Compose

1. Open `https://mail.google.com/`.
2. Click `Compose`.
3. Click inside the email body field.
4. Open AutoTyper Lite and click `Start`.
5. Use `Pause`, `Resume`, and `Stop` while typing.
6. Pause typing, move the WPM slider to a different speed, then click `Resume`.

Expected result: Text appears in the Gmail body because the extension handles `contenteditable` editors with `execCommand("insertText")` plus keyboard/input events.

Expected resume result: Typing continues from the paused character index and uses the newly selected WPM.

## WhatsApp Web

1. Open `https://web.whatsapp.com/`.
2. Open any chat.
3. Click the message composer.
4. Open AutoTyper Lite in the side panel and start typing.
5. Verify the typed text remains in the composer and is not sent automatically.

Expected result: Text appears character-by-character in the WhatsApp contenteditable composer.

## Google Docs

1. Open a document at `https://docs.google.com/`.
2. Click inside the document body where text should be inserted.
3. Open AutoTyper Lite and confirm the side panel shows `Google Docs mode active`.
4. Start typing.
5. Test spaces, punctuation, line breaks, pause, resume, and stop.

Expected result: AutoTyper Lite dispatches `keydown`, `keypress`, `beforeinput`, `input`, and `keyup` events to the Google Docs text event target or editor layer. It does not use `.value` assignment on Google Docs.

## Edge Cases

1. Open a supported page but do not click a text field, then click `Start`.
2. Verify the side panel shows `Please click on a text field first`.
3. Start typing into a field, then close the side panel.
4. Reopen the side panel and verify typing has paused rather than continuing blindly.
5. Start typing, then navigate away.
6. Verify typing stops without errors.

## Reinjection Fallback

1. Load a page before installing or reloading the extension.
2. Click into a text field on that existing page.
3. Open AutoTyper Lite and click `Start`.

Expected result: If the content script was not present, the side panel reinjects `content.js` through `chrome.scripting.executeScript` and retries the command.
