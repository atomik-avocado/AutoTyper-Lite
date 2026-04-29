(function() {
  let typingState = {
    isTyping: false,
    isPaused: false,
    text: '',
    index: 0,
    wpm: 60,
    includeTypos: false,
    timeoutId: null,
    targetElement: null
  };

  function getDelayForChar(wpm) {
    const baseDelay = 60000 / (wpm * 5);
    const variance = 10 + Math.random() * 20;
    return baseDelay + (Math.random() < 0.5 ? -variance : variance);
  }

  function isInputOrTextarea(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }

  function isEditable(el) {
    if (!el) return false;
    if (isInputOrTextarea(el)) return true;
    if (el.isContentEditable === 'true' || el.contentEditable === 'true') return true;

    let parent = el.parentElement;
    while (parent) {
      if (parent.isContentEditable === 'true' || parent.contentEditable === 'true') {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  function findEditableElement() {
    const el = document.activeElement;
    if (isEditable(el)) return el;

    let parent = el?.parentElement;
    while (parent) {
      if (isEditable(parent)) return parent;
      parent = parent.parentElement;
    }
    return null;
  }

  function typeCharStandard(char, target) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;

    const currentValue = target.value || '';
    const newValue = currentValue + char;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(target, newValue);
    } else {
      target.value = newValue;
    }

    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function deleteCharStandard(target) {
    const currentValue = target.value || '';
    if (currentValue.length === 0) return;

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;

    const newValue = currentValue.slice(0, -1);

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(target, newValue);
    } else {
      target.value = newValue;
    }

    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function typeCharContentEditable(char) {
    target.focus();

    if (document.queryCommandSupported('insertText') && document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, char);
    } else {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const textNode = document.createTextNode(char);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  function deleteCharContentEditable() {
    target.focus();

    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = range.startContainer;
        const offset = range.startOffset;

        if (offset > 0) {
          const newText = textNode.textContent.slice(0, -1);
          textNode.textContent = newText;

          range.setStart(textNode, newText.length);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } else {
        range.deleteContents();
      }
    }

    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  }

  function typeNext() {
    if (!typingState.isTyping || typingState.isPaused) return;

    let target = typingState.targetElement;

    if (!target || !document.contains(target)) {
      target = findEditableElement();
      typingState.targetElement = target;
    }

    if (!target) {
      chrome.runtime.sendMessage({
        action: 'error',
        message: 'No input field focused. Please click on a text field.'
      });
      stopTyping();
      return;
    }

    if (typingState.index >= typingState.text.length) {
      chrome.runtime.sendMessage({
        action: 'completed',
        total: typingState.text.length
      });
      stopTyping();
      return;
    }

    const char = typingState.text[typingState.index];
    const shouldMakeTypo = typingState.includeTypos && Math.random() < 0.03;

    if (shouldMakeTypo) {
      const wrongChars = 'qwertyuiopasdfghjkl;zxcvbnm,./';
      const wrongChar = wrongChars[Math.floor(Math.random() * wrongChars.length)];

      if (isInputOrTextarea(target)) {
        typeCharStandard(wrongChar, target);
      } else {
        typeCharContentEditable(wrongChar);
      }

      typingState.timeoutId = setTimeout(() => {
        if (isInputOrTextarea(target)) {
          deleteCharStandard(target);
        } else {
          deleteCharContentEditable();
        }

        typingState.timeoutId = setTimeout(() => {
          if (isInputOrTextarea(target)) {
            typeCharStandard(char, target);
          } else {
            typeCharContentEditable(char);
          }
          typingState.index++;

          chrome.runtime.sendMessage({
            action: 'progress',
            typed: typingState.index,
            total: typingState.text.length,
            status: 'Typing...'
          });

          scheduleNext();
        }, getDelayForChar(typingState.wpm));
      }, getDelayForChar(typingState.wpm));

    } else {
      if (isInputOrTextarea(target)) {
        typeCharStandard(char, target);
      } else {
        typeCharContentEditable(char);
      }
      typingState.index++;

      chrome.runtime.sendMessage({
        action: 'progress',
        typed: typingState.index,
        total: typingState.text.length,
        status: 'Typing...'
      });

      scheduleNext();
    }
  }

  function scheduleNext() {
    if (!typingState.isTyping || typingState.isPaused) return;
    const delay = getDelayForChar(typingState.wpm);
    typingState.timeoutId = setTimeout(typeNext, delay);
  }

  function startTyping(text, wpm, includeTypos) {
    if (typingState.timeoutId) {
      clearTimeout(typingState.timeoutId);
    }

    const target = findEditableElement();

    typingState = {
      isTyping: true,
      isPaused: false,
      text: text,
      index: 0,
      wpm: wpm,
      includeTypos: includeTypos,
      timeoutId: null,
      targetElement: target
    };

    if (!target) {
      chrome.runtime.sendMessage({
        action: 'error',
        message: 'No input field focused. Please click on a text field.'
      });
      return;
    }

    chrome.runtime.sendMessage({ action: 'started' });
    typeNext();
  }

  function pauseTyping() {
    if (!typingState.isTyping) return;
    if (typingState.timeoutId) {
      clearTimeout(typingState.timeoutId);
      typingState.timeoutId = null;
    }
    typingState.isPaused = true;
    chrome.runtime.sendMessage({ action: 'paused' });
  }

  function resumeTyping() {
    if (!typingState.isTyping || !typingState.isPaused) return;
    typingState.isPaused = false;
    typeNext();
  }

  function stopTyping() {
    if (typingState.timeoutId) {
      clearTimeout(typingState.timeoutId);
      typingState.timeoutId = null;
    }
    typingState.isTyping = false;
    typingState.isPaused = false;
    chrome.runtime.sendMessage({ action: 'stopped' });
  }

  document.addEventListener('focusout', (e) => {
    if (typingState.isTyping && !typingState.isPaused) {
      const activeEl = document.activeElement;
      const relatedTarget = e.relatedTarget;

      if (relatedTarget === null || !(activeEl?.contains?.(relatedTarget) || activeEl === relatedTarget)) {
        chrome.runtime.sendMessage({ action: 'focusLost' });
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && typingState.isTyping && !typingState.isPaused) {
      pauseTyping();
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'start':
        startTyping(message.text, message.wpm, message.includeTypos);
        break;
      case 'pause':
        pauseTyping();
        break;
      case 'resume':
        resumeTyping();
        break;
      case 'stop':
        stopTyping();
        break;
      case 'debug':
        const target = findEditableElement();
        chrome.runtime.sendMessage({
          action: 'debug',
          info: JSON.stringify({
            activeTag: document.activeElement?.tagName,
            activeCE: document.activeElement?.contentEditable,
            activeValue: document.activeElement?.value?.slice(0, 50),
            foundTarget: !!target,
            targetTag: target?.tagName,
            targetCE: target?.contentEditable
          }, null, 2)
        });
        break;
    }
    sendResponse({ received: true });
    return true;
  });
})();
