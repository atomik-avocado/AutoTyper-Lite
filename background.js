const PANEL_PORT_NAME = "autotyper-lite-panel";
const MESSAGE_SOURCE = "autotyper-lite";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  if (tab && Number.isInteger(tab.windowId)) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length ? tabs[0] : null;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (_error) {
    // The side panel handles reinjection for explicit user commands. On disconnect,
    // failing silently is preferable to waking a page solely to pause it.
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT_NAME) {
    return;
  }

  port.onDisconnect.addListener(() => {
    sendToActiveTab({
      source: MESSAGE_SOURCE,
      command: "pause",
      reason: "panel_closed"
    });
  });
});
