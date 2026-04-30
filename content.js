(() => {
  "use strict";

  if (window.__AUTO_TYPER_LITE_LOADED__) {
    return;
  }
  window.__AUTO_TYPER_LITE_LOADED__ = true;

  const MESSAGE_SOURCE = "autotyper-lite";
  const TYPEABLE_INPUT_TYPES = new Set([
    "text",
    "email",
    "search",
    "url",
    "tel",
    "password"
  ]);

  const state = {
    active: false,
    paused: false,
    stopped: true,
    text: "",
    index: 0,
    total: 0,
    wpm: 80,
    typos: false,
    target: null,
    strategy: null,
    timer: 0
  };

  function sendStatus(extra = {}) {
    chrome.runtime.sendMessage({
      source: MESSAGE_SOURCE,
      type: "status",
      state: state.paused ? "paused" : state.active ? "typing" : state.stopped ? "stopped" : "done",
      typed: state.index,
      total: state.total,
      ...extra
    }).catch(() => {});
  }

  function stopTimer() {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = 0;
    }
  }

  function resetRun() {
    stopTimer();
    state.active = false;
    state.paused = false;
    state.stopped = true;
    state.text = "";
    state.index = 0;
    state.total = 0;
    state.target = null;
    state.strategy = null;
  }

  function isGoogleDocsPage() {
    return location.hostname === "docs.google.com";
  }

  function isEditableInput(element) {
    if (!(element instanceof HTMLInputElement)) {
      return false;
    }
    const type = (element.getAttribute("type") || "text").toLowerCase();
    return TYPEABLE_INPUT_TYPES.has(type) && !element.disabled && !element.readOnly;
  }

  function isTextArea(element) {
    return element instanceof HTMLTextAreaElement && !element.disabled && !element.readOnly;
  }

  function isContentEditable(element) {
    return element instanceof HTMLElement && element.isContentEditable;
  }

  function composedActiveElement(root = document) {
    let active = root.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  function queryShadow(root, selector) {
    const direct = root.querySelector(selector);
    if (direct) {
      return direct;
    }

    const all = root.querySelectorAll("*");
    for (const element of all) {
      if (element.shadowRoot) {
        const match = queryShadow(element.shadowRoot, selector);
        if (match) {
          return match;
        }
      }
    }
    return null;
  }

  function findTypeableFrom(element) {
    let current = element;

    while (current && current !== document.documentElement) {
      if (isEditableInput(current) || isTextArea(current) || isContentEditable(current)) {
        return current;
      }

      if (current.shadowRoot) {
        const shadowInput = queryShadow(current.shadowRoot, "input, textarea, [contenteditable='true'], [contenteditable='']");
        if (shadowInput && (isEditableInput(shadowInput) || isTextArea(shadowInput) || isContentEditable(shadowInput))) {
          return shadowInput;
        }
      }

      current = current.parentElement;
    }

    return null;
  }

  function findGoogleDocsTarget() {
    const textEventIframe = document.querySelector("iframe.docs-texteventtarget-iframe, .docs-texteventtarget-iframe iframe");
    if (textEventIframe) {
      try {
        const frameDoc = textEventIframe.contentDocument;
        if (frameDoc && frameDoc.body) {
          frameDoc.body.focus();
          return {
            target: frameDoc.body,
            eventView: textEventIframe.contentWindow || window,
            strategy: "google-docs"
          };
        }
      } catch (_error) {
        // Cross-origin access can fail in some Docs surfaces; fall back below.
      }
    }

    const candidates = [
      document.querySelector(".docs-texteventtarget-iframe"),
      document.querySelector(".docs-texteventtarget"),
      document.querySelector(".kix-canvas-tile-content"),
      document.querySelector("[contenteditable='true']"),
      document.activeElement
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate instanceof HTMLIFrameElement) {
        try {
          if (candidate.contentDocument && candidate.contentDocument.body) {
            candidate.contentDocument.body.focus();
            return {
              target: candidate.contentDocument.body,
              eventView: candidate.contentWindow || window,
              strategy: "google-docs"
            };
          }
        } catch (_error) {
          continue;
        }
      }

      if (candidate instanceof HTMLElement) {
        candidate.focus();
        return {
          target: candidate,
          eventView: window,
          strategy: "google-docs"
        };
      }
    }

    return null;
  }

  function isLikelyActiveFrame() {
    if (document.hasFocus()) {
      return true;
    }

    const active = document.activeElement;
    return Boolean(
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      (active.tagName === "IFRAME" ||
        isEditableInput(active) ||
        isTextArea(active) ||
        isContentEditable(active))
    );
  }

  function getTargetContext() {
    if (isGoogleDocsPage()) {
      const docsTarget = findGoogleDocsTarget();
      if (docsTarget) {
        return docsTarget;
      }
    }

    const active = composedActiveElement();
    const target = findTypeableFrom(active);
    if (!target) {
      return null;
    }

    if (isEditableInput(target) || isTextArea(target)) {
      return { target, eventView: window, strategy: "standard" };
    }

    if (isContentEditable(target)) {
      return { target, eventView: window, strategy: "contenteditable" };
    }

    return null;
  }

  function getKeyInfo(char) {
    if (char === "\n") {
      return { key: "Enter", code: "Enter", keyCode: 13, which: 13 };
    }
    if (char === "\t") {
      return { key: "Tab", code: "Tab", keyCode: 9, which: 9 };
    }
    if (char === " ") {
      return { key: " ", code: "Space", keyCode: 32, which: 32 };
    }
    if (char === "\b") {
      return { key: "Backspace", code: "Backspace", keyCode: 8, which: 8 };
    }
    const upper = char.length === 1 ? char.toUpperCase() : char;
    return {
      key: char,
      code: /^[a-z]$/i.test(char) ? `Key${upper}` : "",
      keyCode: char.length === 1 ? char.charCodeAt(0) : 0,
      which: char.length === 1 ? char.charCodeAt(0) : 0
    };
  }

  function dispatchKeyboard(target, type, char, eventView = window) {
    const keyInfo = getKeyInfo(char);
    const event = new eventView.KeyboardEvent(type, {
      key: keyInfo.key,
      code: keyInfo.code,
      keyCode: keyInfo.keyCode,
      which: keyInfo.which,
      bubbles: true,
      cancelable: true,
      composed: true
    });
    target.dispatchEvent(event);
    return event;
  }

  function dispatchInput(target, inputType, data, eventView = window) {
    const event = new eventView.InputEvent("input", {
      bubbles: true,
      cancelable: false,
      composed: true,
      inputType,
      data
    });
    target.dispatchEvent(event);
  }

  function dispatchBeforeInput(target, inputType, data, eventView = window) {
    const event = new eventView.InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType,
      data
    });
    target.dispatchEvent(event);
    return event;
  }

  function dispatchChange(target) {
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getTextSelection(element) {
    try {
      if (typeof element.selectionStart === "number" && typeof element.selectionEnd === "number") {
        return {
          start: element.selectionStart,
          end: element.selectionEnd
        };
      }
    } catch (_error) {
      // Some input types, including email in certain browsers, do not expose text selection.
    }

    return {
      start: element.value.length,
      end: element.value.length
    };
  }

  function setTextSelection(element, position) {
    try {
      if (typeof element.setSelectionRange === "function") {
        element.setSelectionRange(position, position);
      }
    } catch (_error) {
      // Unsupported input types still receive the updated value and input event.
    }
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function insertIntoStandard(element, char) {
    element.focus();

    if (char === "\b") {
      const { start, end } = getTextSelection(element);
      const deleteStart = start === end ? Math.max(0, start - 1) : start;
      const nextValue = element.value.slice(0, deleteStart) + element.value.slice(end);
      setNativeValue(element, nextValue);
      setTextSelection(element, deleteStart);
      dispatchInput(element, "deleteContentBackward", null);
      dispatchChange(element);
      return;
    }

    const { start, end } = getTextSelection(element);
    const nextValue = element.value.slice(0, start) + char + element.value.slice(end);
    setNativeValue(element, nextValue);
    const nextCaret = start + char.length;
    setTextSelection(element, nextCaret);
    dispatchInput(element, char === "\n" ? "insertLineBreak" : "insertText", char);
    dispatchChange(element);
  }

  function insertIntoContentEditable(element, char) {
    element.focus();

    if (char === "\b") {
      dispatchKeyboard(element, "keydown", "\b");
      document.execCommand("delete", false);
      dispatchInput(element, "deleteContentBackward", null);
      dispatchKeyboard(element, "keyup", "\b");
      return;
    }

    dispatchKeyboard(element, "keydown", char);
    dispatchKeyboard(element, "keypress", char);
    const inputType = char === "\n" ? "insertLineBreak" : "insertText";
    dispatchBeforeInput(element, inputType, char);

    const inserted = char === "\n"
      ? document.execCommand("insertLineBreak", false)
      : document.execCommand("insertText", false, char);

    if (!inserted) {
      const selection = document.getSelection();
      if (selection && selection.rangeCount) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(char));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    dispatchInput(element, inputType, char);
    dispatchKeyboard(element, "keyup", char);
  }

  function insertIntoGoogleDocs(targetContext, char) {
    const { target, eventView } = targetContext;
    target.focus();

    if (char === "\b") {
      dispatchKeyboard(target, "keydown", "\b", eventView);
      dispatchBeforeInput(target, "deleteContentBackward", null, eventView);
      dispatchInput(target, "deleteContentBackward", null, eventView);
      dispatchKeyboard(target, "keyup", "\b", eventView);
      return;
    }

    dispatchKeyboard(target, "keydown", char, eventView);
    dispatchKeyboard(target, "keypress", char, eventView);
    dispatchBeforeInput(target, char === "\n" ? "insertLineBreak" : "insertText", char, eventView);
    dispatchInput(target, char === "\n" ? "insertLineBreak" : "insertText", char, eventView);
    dispatchKeyboard(target, "keyup", char, eventView);
  }

  function randomWrongCharacter(correct) {
    if (/\s/.test(correct)) {
      return "x";
    }
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    const lower = correct.toLowerCase();
    let wrong = alphabet[Math.floor(Math.random() * alphabet.length)];
    if (wrong === lower) {
      wrong = wrong === "z" ? "a" : alphabet[alphabet.indexOf(wrong) + 1];
    }
    return correct === lower ? wrong : wrong.toUpperCase();
  }

  function shouldMakeTypo(char) {
    return state.typos && char.length === 1 && char !== "\b" && Math.random() < 0.025;
  }

  function charDelayMs() {
    const safeWpm = Math.min(200, Math.max(20, Number(state.wpm) || 80));
    const base = 60000 / (safeWpm * 5);
    const variance = 10 + Math.random() * 20;
    const signedVariance = Math.random() > 0.5 ? variance : -variance;
    return Math.max(18, base + signedVariance);
  }

  function insertCharacter(char) {
    if (!state.target || !state.strategy) {
      return;
    }

    if (state.strategy === "google-docs") {
      insertIntoGoogleDocs(state.target, char);
      return;
    }

    if (state.strategy === "standard") {
      insertIntoStandard(state.target.target || state.target, char);
      return;
    }

    insertIntoContentEditable(state.target.target || state.target, char);
  }

  function scheduleNext(delay = charDelayMs()) {
    stopTimer();
    state.timer = setTimeout(typeNext, delay);
  }

  function typeNext() {
    if (!state.active || state.stopped || state.paused) {
      return;
    }

    if (state.index >= state.total) {
      state.active = false;
      state.stopped = false;
      stopTimer();
      sendStatus({ state: "done" });
      return;
    }

    const char = state.text[state.index];
    if (shouldMakeTypo(char)) {
      const wrong = randomWrongCharacter(char);
      insertCharacter(wrong);
      stopTimer();
      state.timer = setTimeout(() => {
        if (!state.active || state.paused || state.stopped) {
          return;
        }
        insertCharacter("\b");
        state.timer = setTimeout(() => {
          if (!state.active || state.paused || state.stopped) {
            return;
          }
          insertCharacter(char);
          state.index += 1;
          sendStatus();
          scheduleNext();
        }, 35 + Math.random() * 60);
      }, 55 + Math.random() * 95);
      return;
    }

    insertCharacter(char);
    state.index += 1;
    sendStatus();
    scheduleNext();
  }

  function startTyping({ text, wpm, typos }, targetContext) {
    stopTimer();
    state.active = true;
    state.paused = false;
    state.stopped = false;
    state.text = String(text || "");
    state.index = 0;
    state.total = state.text.length;
    state.wpm = wpm;
    state.typos = Boolean(typos);
    state.target = targetContext;
    state.strategy = targetContext.strategy;

    sendStatus();
    scheduleNext(80);
    return { ok: true };
  }

  function pauseTyping() {
    if (!state.active || state.paused) {
      return { ok: true };
    }
    state.paused = true;
    stopTimer();
    sendStatus({ state: "paused" });
    return { ok: true };
  }

  function resumeTyping() {
    if (!state.active || !state.paused) {
      return { ok: true };
    }
    state.paused = false;
    sendStatus();
    scheduleNext(50);
    return { ok: true };
  }

  function statusSnapshot() {
    return {
      ok: true,
      state: state.paused ? "paused" : state.active ? "typing" : state.stopped ? "stopped" : "done",
      typed: state.index,
      total: state.total,
      wpm: state.wpm,
      typos: state.typos
    };
  }

  function updateRuntimeSettings({ wpm, typos }) {
    if (Number.isFinite(Number(wpm))) {
      state.wpm = Math.min(200, Math.max(20, Number(wpm)));
    }
    if (typeof typos === "boolean") {
      state.typos = typos;
    }
    return statusSnapshot();
  }

  function stopTyping() {
    const typed = state.index;
    const total = state.total;
    resetRun();
    state.index = typed;
    state.total = total;
    sendStatus({ state: "stopped", typed, total });
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.source !== MESSAGE_SOURCE) {
      return false;
    }

    if (message.command === "start") {
      const targetContext = isLikelyActiveFrame() ? getTargetContext() : null;
      if (targetContext) {
        sendResponse(startTyping(message, targetContext));
      } else {
        setTimeout(() => {
          sendResponse({ ok: false, error: "Please click on a text field first" });
        }, 150);
      }
      return true;
    }

    if (message.command === "pause") {
      sendResponse(pauseTyping());
      return true;
    }

    if (message.command === "resume") {
      updateRuntimeSettings(message);
      sendResponse(resumeTyping());
      return true;
    }

    if (message.command === "stop") {
      sendResponse(stopTyping());
      return true;
    }

    if (message.command === "getStatus") {
      if (state.active || state.paused || !state.stopped) {
        sendResponse(statusSnapshot());
      } else {
        setTimeout(() => {
          sendResponse(statusSnapshot());
        }, 100);
      }
      return true;
    }

    if (message.command === "updateSettings") {
      sendResponse(updateRuntimeSettings(message));
      return true;
    }

    sendResponse({ ok: false, error: "Unknown command." });
    return true;
  });

  window.addEventListener("beforeunload", () => {
    resetRun();
  });
})();
