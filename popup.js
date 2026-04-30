"use strict";

const MESSAGE_SOURCE = "autotyper-lite";
const DEFAULTS = {
  text: "",
  wpm: 80,
  typos: false,
  theme: "dark"
};

const els = {
  textInput: document.getElementById("textInput"),
  speedRange: document.getElementById("speedRange"),
  speedValue: document.getElementById("speedValue"),
  typoToggle: document.getElementById("typoToggle"),
  startButton: document.getElementById("startButton"),
  pauseButton: document.getElementById("pauseButton"),
  stopButton: document.getElementById("stopButton"),
  statusBar: document.getElementById("statusBar"),
  progressBar: document.getElementById("progressBar"),
  docsNotice: document.getElementById("docsNotice"),
  themeToggle: document.getElementById("themeToggle"),
  themeLabel: document.getElementById("themeLabel")
};

let typingState = "idle";
let lastProgress = { typed: 0, total: 0 };
const panelPort = chrome.runtime.connect({ name: "autotyper-lite-panel" });
void panelPort;

function setStatus(message) {
  els.statusBar.textContent = message;
}

function setProgress(typed, total) {
  lastProgress = { typed, total };
  els.progressBar.max = Math.max(total, 1);
  els.progressBar.value = Math.min(typed, total);
}

function syncButtons() {
  const hasText = els.textInput.value.trim().length > 0;
  els.startButton.disabled = !hasText || typingState === "typing" || typingState === "paused";
  els.pauseButton.disabled = typingState !== "typing" && typingState !== "paused";
  els.pauseButton.textContent = typingState === "paused" ? "Resume" : "Pause";
  els.stopButton.disabled = typingState === "idle" || typingState === "done" || typingState === "stopped";
}

function updateSpeedLabel() {
  els.speedValue.textContent = `${els.speedRange.value} WPM`;
}

function pushRuntimeSettings() {
  if (typingState !== "typing" && typingState !== "paused") {
    return;
  }

  sendCommand("updateSettings", {
    wpm: Number(els.speedRange.value),
    typos: els.typoToggle.checked
  }).catch(() => {});
}

function applyTheme(theme) {
  const safeTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = safeTheme;
  els.themeToggle.checked = safeTheme === "light";
  els.themeLabel.textContent = safeTheme;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length ? tabs[0] : null;
}

function saveSettings() {
  chrome.storage.local.set({
    text: els.textInput.value,
    wpm: Number(els.speedRange.value),
    typos: els.typoToggle.checked,
    theme: els.themeToggle.checked ? "light" : "dark"
  });
}

function debounce(fn, delay) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function executeContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"]
  });
}

async function sendCommand(command, payload = {}) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    return { ok: false, error: "No active tab found." };
  }

  const message = {
    source: MESSAGE_SOURCE,
    command,
    ...payload
  };

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    const messageText = String(error && error.message ? error.message : error);
    if (!messageText.includes("Could not establish connection") && !messageText.includes("Receiving end does not exist")) {
      throw error;
    }

    try {
      await executeContentScript(tab.id);
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (retryError) {
      return {
        ok: false,
        error: "Could not connect to this page. Chrome blocks extensions on internal pages and the Web Store."
      };
    }
  }
}

async function loadSettings() {
  const values = await chrome.storage.local.get(DEFAULTS);
  els.textInput.value = values.text || "";
  els.speedRange.value = values.wpm || DEFAULTS.wpm;
  els.typoToggle.checked = Boolean(values.typos);
  applyTheme(values.theme || DEFAULTS.theme);
  updateSpeedLabel();
  syncButtons();
}

async function updateSiteNotice() {
  const tab = await getActiveTab();
  const url = tab && tab.url ? tab.url : "";
  els.docsNotice.classList.toggle("visible", url.startsWith("https://docs.google.com/"));
}

async function startTyping() {
  const text = els.textInput.value;
  if (!text.trim()) {
    setStatus("Enter text before starting.");
    return;
  }

  saveSettings();
  typingState = "typing";
  setProgress(0, text.length);
  setStatus(`Starting... 0/${text.length} chars`);
  syncButtons();

  const response = await sendCommand("start", {
    text,
    wpm: Number(els.speedRange.value),
    typos: els.typoToggle.checked
  });

  if (!response || response.ok === false) {
    typingState = "idle";
    setStatus(response && response.error ? response.error : "Please click on a text field first");
    syncButtons();
  }
}

async function togglePause() {
  if (typingState === "paused") {
    typingState = "typing";
    setStatus(`Resuming... ${lastProgress.typed}/${lastProgress.total} chars`);
    saveSettings();
    syncButtons();
    const response = await sendCommand("resume", {
      wpm: Number(els.speedRange.value),
      typos: els.typoToggle.checked
    });
    if (response && response.ok === false) {
      typingState = "paused";
      setStatus(response.error || `Paused ${lastProgress.typed}/${lastProgress.total} chars`);
      syncButtons();
    }
    return;
  }

  typingState = "paused";
  setStatus(`Paused ${lastProgress.typed}/${lastProgress.total} chars`);
  syncButtons();
  await sendCommand("pause");
}

async function stopTyping() {
  typingState = "stopped";
  setStatus(`Stopped ${lastProgress.typed}/${lastProgress.total} chars`);
  syncButtons();
  await sendCommand("stop");
}

const debouncedSave = debounce(saveSettings, 200);

els.textInput.addEventListener("input", () => {
  debouncedSave();
  syncButtons();
});

els.speedRange.addEventListener("input", () => {
  updateSpeedLabel();
  debouncedSave();
  pushRuntimeSettings();
});

els.typoToggle.addEventListener("change", () => {
  saveSettings();
  pushRuntimeSettings();
});
els.themeToggle.addEventListener("change", () => {
  applyTheme(els.themeToggle.checked ? "light" : "dark");
  saveSettings();
});
els.startButton.addEventListener("click", startTyping);
els.pauseButton.addEventListener("click", togglePause);
els.stopButton.addEventListener("click", stopTyping);

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.source !== MESSAGE_SOURCE || message.type !== "status") {
    return;
  }

  const typed = Number(message.typed || 0);
  const total = Number(message.total || 0);
  setProgress(typed, total);

  if (message.state) {
    typingState = message.state;
  }

  if (message.error) {
    setStatus(message.error);
  } else if (message.state === "typing") {
    setStatus(`Typing... ${typed}/${total} chars`);
  } else if (message.state === "paused") {
    setStatus(`Paused ${typed}/${total} chars`);
  } else if (message.state === "done") {
    setStatus(`Complete ${typed}/${total} chars`);
  } else if (message.state === "stopped") {
    setStatus(`Stopped ${typed}/${total} chars`);
  }

  syncButtons();
});

async function restoreRemoteStatus() {
  const response = await sendCommand("getStatus").catch(() => null);
  if (!response || response.ok === false || !response.state) {
    return;
  }

  typingState = response.state;
  setProgress(Number(response.typed || 0), Number(response.total || 0));

  if (typingState === "typing") {
    setStatus(`Typing... ${lastProgress.typed}/${lastProgress.total} chars`);
  } else if (typingState === "paused") {
    setStatus(`Paused ${lastProgress.typed}/${lastProgress.total} chars`);
  } else if (typingState === "done") {
    setStatus(`Complete ${lastProgress.typed}/${lastProgress.total} chars`);
  } else if (typingState === "stopped") {
    setStatus(`Stopped ${lastProgress.typed}/${lastProgress.total} chars`);
  }

  syncButtons();
}

chrome.tabs.onActivated.addListener(() => {
  updateSiteNotice();
  restoreRemoteStatus();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    updateSiteNotice();
    restoreRemoteStatus();
  }
});

loadSettings().then(() => {
  updateSiteNotice();
  restoreRemoteStatus();
});
