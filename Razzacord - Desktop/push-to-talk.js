/**
 * Push-to-talk global: escuta a tecla mesmo com o jogo em foco (uiohook-napi, dependência opcional).
 * Sem o módulo nativo, setKey devolve false e a aplicação cai no push-to-talk com a janela em foco.
 */
let hook = null;
let keycodes = null;
let loaded = false;
let started = false;
let currentCode = null;
let notify = () => {};
let pressed = false;

function load() {
  if (loaded) return !!hook;
  loaded = true;
  try {
    const mod = require('uiohook-napi');
    hook = mod.uIOhook;
    keycodes = mod.UiohookKey;
    hook.on('keydown', (e) => {
      if (currentCode !== null && e.keycode === currentCode && !pressed) {
        pressed = true;
        notify(true);
      }
    });
    hook.on('keyup', (e) => {
      if (currentCode !== null && e.keycode === currentCode && pressed) {
        pressed = false;
        notify(false);
      }
    });
  } catch (err) {
    console.warn('[Razzacord Desktop] Push-to-talk global indisponível:', err.message);
    hook = null;
  }
  return !!hook;
}

/** KeyboardEvent.code -> nome em UiohookKey */
function toUiohookName(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const aliases = {
    ControlLeft: 'Ctrl',
    ControlRight: 'CtrlRight',
    AltLeft: 'Alt',
    AltRight: 'AltRight',
    ShiftLeft: 'Shift',
    ShiftRight: 'ShiftRight',
    MetaLeft: 'Meta',
    MetaRight: 'MetaRight',
    Backquote: 'Grave',
    Backslash: 'Backslash',
    BracketLeft: 'BracketLeft',
    BracketRight: 'BracketRight',
    Comma: 'Comma',
    Period: 'Period',
    Semicolon: 'Semicolon',
    Slash: 'Slash',
    Quote: 'Quote',
    Minus: 'Minus',
    Equal: 'Equal',
  };
  return aliases[code] || code; // Space, Backquote, F1..F24, ArrowUp, Numpad0, ...
}

function setKey(code, onChange) {
  pressed = false;
  if (!code) {
    currentCode = null;
    notify = () => {};
    return true;
  }
  if (!load()) return false;

  const value = keycodes[toUiohookName(String(code))];
  if (typeof value !== 'number') {
    currentCode = null;
    return false;
  }

  currentCode = value;
  notify = onChange;
  if (!started) {
    hook.start();
    started = true;
  }
  return true;
}

function dispose() {
  if (hook && started) {
    try {
      hook.stop();
    } catch (_) {
      /* encerrando */
    }
  }
  started = false;
}

module.exports = { setKey, dispose };
