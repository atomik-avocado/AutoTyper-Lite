const textInput = document.getElementById('textInput');
const speedSlider = document.getElementById('speedSlider');
const wpmValue = document.getElementById('wpmValue');
const typoToggle = document.getElementById('typoToggle');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
const progressFill = document.getElementById('progressFill');
const progressCount = document.getElementById('progressCount');
const errorMessage = document.getElementById('errorMessage');
const debugInfo = document.getElementById('debugInfo');
const checkFieldBtn = document.getElementById('checkFieldBtn');

let isPaused = false;
let currentWpm = 60;
let currentTabId = null;

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('visible');
}

function hideError() {
  errorMessage.classList.remove('visible');
}

function updateProgress(typed, total) {
  const percent = total > 0 ? (typed / total) * 100 : 0;
  progressFill.style.width = `${percent}%`;
  progressCount.textContent = `${typed}/${total}`;
}

function setUIState(state) {
  switch (state) {
    case 'idle':
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      pauseBtn.textContent = 'Pause';
      stopBtn.disabled = true;
      textInput.disabled = false;
      isPaused = false;
      break;
    case 'typing':
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      pauseBtn.textContent = 'Pause';
      stopBtn.disabled = false;
      textInput.disabled = true;
      isPaused = false;
      break;
    case 'paused':
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      pauseBtn.textContent = 'Resume';
      stopBtn.disabled = false;
      textInput.disabled = true;
      isPaused = true;
      break;
    case 'completed':
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      pauseBtn.textContent = 'Pause';
      stopBtn.disabled = true;
      textInput.disabled = false;
      isPaused = false;
      break;
  }
}

function updateStatus(text) {
  statusText.textContent = text;
}

function loadSettings() {
  chrome.storage.local.get(['lastText', 'lastWpm', 'lastTypo'], (result) => {
    if (result.lastText) {
      textInput.value = result.lastText;
    }
    if (result.lastWpm) {
      currentWpm = result.lastWpm;
      speedSlider.value = currentWpm;
      wpmValue.textContent = `${currentWpm} WPM`;
    }
    if (result.lastTypo !== undefined) {
      typoToggle.checked = result.lastTypo;
    }
  });
}

function saveSettings() {
  chrome.storage.local.set({
    lastText: textInput.value,
    lastWpm: parseInt(speedSlider.value),
    lastTypo: typoToggle.checked
  });
}

loadSettings();

speedSlider.addEventListener('input', () => {
  currentWpm = parseInt(speedSlider.value);
  wpmValue.textContent = `${currentWpm} WPM`;
  saveSettings();
});

typoToggle.addEventListener('change', saveSettings);
textInput.addEventListener('input', saveSettings);

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function checkFocusedElement() {
  const tab = await getCurrentTab();
  if (!tab || !tab.id) return null;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: checkFocusedElementInPage
    });
    return results[0];
  } catch (err) {
    console.error('Check failed:', err);
    return null;
  }
}

checkFieldBtn.addEventListener('click', async () => {
  const result = await checkFocusedElement();
  if (result) {
    let info = `Tag: ${result.tagName}\n`;
    info += `Type: ${result.type || 'N/A'}\n`;
    info += `ContentEditable: ${result.isContentEditable}\n`;
    info += `Text: "${result.textContent?.slice(0, 50)}..."\n`;
    info += `Has Parent CE: ${result.hasParentContentEditable}`;
    debugInfo.textContent = info;
  } else {
    debugInfo.textContent = 'Could not detect element. Try clicking inside a text field.';
  }
});

startBtn.addEventListener('click', async () => {
  hideError();

  const text = textInput.value;
  if (!text) {
    showError('Please enter some text to type');
    return;
  }

  saveSettings();

  const tab = await getCurrentTab();
  if (!tab || !tab.id) {
    showError('Unable to get active tab');
    return;
  }

  currentTabId = tab.id;

  try {
    const result = await checkFocusedElement();

    if (!result) {
      showError('Unable to access page. Try refreshing.');
      return;
    }

    if (!result.result) {
      showError('Please click on a text field first, then try again');
      return;
    }

    updateStatus('Starting...');
    setUIState('typing');

    chrome.runtime.sendMessage({
      action: 'start',
      text: text,
      wpm: currentWpm,
      includeTypos: typoToggle.checked,
      tabId: currentTabId
    }, (response) => {
      if (chrome.runtime.lastError) {
        showError('Error: ' + chrome.runtime.lastError.message);
        setUIState('idle');
      }
    });

  } catch (err) {
    showError('Unable to access the page. Please refresh and try again.');
    setUIState('idle');
  }
});

pauseBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: isPaused ? 'resume' : 'pause', tabId: currentTabId });
  setUIState(isPaused ? 'typing' : 'paused');
  updateStatus(isPaused ? 'Resumed' : 'Paused');
  isPaused = !isPaused;
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop', tabId: currentTabId });
  setUIState('idle');
  updateStatus('Stopped');
  updateProgress(0, textInput.value.length);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'progress') {
    updateProgress(message.typed, message.total);
    updateStatus(message.status);
  } else if (message.action === 'completed') {
    setUIState('completed');
    updateStatus('Completed!');
    updateProgress(message.total, message.total);
  } else if (message.action === 'error') {
    showError(message.message);
    setUIState('idle');
  } else if (message.action === 'paused') {
    setUIState('paused');
    updateStatus('Paused');
  } else if (message.action === 'stopped') {
    setUIState('idle');
    updateStatus('Stopped');
  } else if (message.action === 'focusLost') {
    if (!isPaused && !startBtn.disabled) return;
    chrome.runtime.sendMessage({ action: 'pause', tabId: currentTabId });
    setUIState('paused');
    updateStatus('Paused (clicked elsewhere)');
    showError('Typing paused - click on a text field to resume');
  } else if (message.action === 'started') {
    updateStatus('Typing...');
  } else if (message.action === 'debug') {
    debugInfo.textContent = message.info;
  }
});

function checkFocusedElementInPage() {
  const el = document.activeElement;
  if (!el) {
    return { result: false, tagName: null, type: null, isContentEditable: false, textContent: '', hasParentContentEditable: false };
  }

  const result = {
    result: false,
    tagName: el.tagName,
    type: el.type || null,
    isContentEditable: el.isContentEditable === 'true' || el.contentEditable === 'true',
    textContent: el.textContent?.slice(0, 100) || '',
    hasParentContentEditable: false
  };

  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    result.result = true;
  } else if (result.isContentEditable) {
    result.result = true;
  } else {
    let parent = el.parentElement;
    while (parent) {
      if (parent.isContentEditable === 'true' || parent.contentEditable === 'true') {
        result.result = true;
        result.hasParentContentEditable = true;
        break;
      }
      parent = parent.parentElement;
    }
  }

  return result;
}
