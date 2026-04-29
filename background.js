chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId;

  if (!tabId) {
    console.warn('No tabId in message:', message);
    sendResponse({ error: 'No tabId' });
    return;
  }

  if (message.action === 'start' || message.action === 'pause' ||
      message.action === 'resume' || message.action === 'stop' ||
      message.action === 'debug') {

    chrome.tabs.sendMessage(tabId, message)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        console.error('Failed to send message to tab:', error);
        sendResponse({ error: error.message });
      });
  } else {
    sendResponse({ received: true });
  }

  return true;
});
