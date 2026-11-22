/**
 * Captura de áudio por aplicativo (WASAPI process loopback, Windows 10 2004+).
 *
 * Usa os executáveis do pacote `application-loopback` (derivados do exemplo oficial da Microsoft em
 * Windows-classic-samples/ApplicationLoopback): ApplicationLoopback.exe <PID> escreve PCM s16le,
 * 48 kHz, estéreo no stdout capturando só a árvore de processos do PID, e ProcessList.exe lista
 * "pid;hwnd;título" das janelas visíveis. Assim o áudio da call (Discord, Razzacord) nunca entra na transmissão.
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const FRAME_BYTES = 4; // 2 canais * 16 bits

function binDir() {
  let dir;
  try {
    dir = path.join(path.dirname(require.resolve('application-loopback/package.json')), 'bin');
  } catch (_) {
    return null;
  }
  // Dentro do instalador os executáveis ficam fora do .asar (asarUnpack no package.json).
  return dir.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

function exe(name) {
  const dir = binDir();
  return dir ? path.join(dir, `${process.platform}-${process.arch}`, name) : null;
}

function isSupported() {
  if (process.platform !== 'win32' || process.arch !== 'x64') return false;
  // Process loopback exige o build 19041 (Windows 10 2004) ou superior.
  const build = Number(os.release().split('.')[2]);
  return Number.isFinite(build) && build >= 19041 && !!exe('ApplicationLoopback.exe');
}

function listWindows() {
  const bin = exe('ProcessList.exe');
  if (!isSupported() || !bin) return Promise.resolve([]);
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(bin, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const timer = setTimeout(() => child.kill(), 5000);
    child.stdout.on('data', (d) => chunks.push(d));
    child.on('error', () => resolve([]));
    child.on('close', () => {
      clearTimeout(timer);
      // A saída vem na codepage ANSI do Windows; latin1 preserva os acentos do português.
      const text = Buffer.concat(chunks).toString('latin1');
      const result = [];
      for (const line of text.split(/\r?\n/)) {
        const [pid, hwnd, ...title] = line.split(';');
        const parsedPid = Number(pid);
        if (Number.isInteger(parsedPid) && parsedPid > 0 && hwnd) {
          result.push({ pid: parsedPid, hwnd: hwnd.trim(), title: title.join(';').trim() });
        }
      }
      resolve(result);
    });
  });
}

let capture = null;

function stop() {
  if (capture) {
    capture.stopped = true;
    try {
      capture.child.kill();
    } catch (_) {
      /* já encerrou */
    }
    capture = null;
  }
}

function start(pid, { onData, onEnd }) {
  stop();
  const bin = exe('ApplicationLoopback.exe');
  if (!isSupported() || !bin) {
    onEnd();
    return;
  }
  // O executável espera por uma tecla no stdin para encerrar: o stdin precisa ficar aberto (com 'ignore' ele sai na hora).
  const child = spawn(bin, [String(pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  child.stdin.on('error', () => {});
  const current = { child, stopped: false };
  capture = current;

  let leftover = Buffer.alloc(0);
  child.stdout.on('data', (data) => {
    // Os pedaços do pipe não respeitam fronteiras de frame: entrega só múltiplos de 4 bytes.
    const buf = leftover.length ? Buffer.concat([leftover, data]) : data;
    const usable = buf.length - (buf.length % FRAME_BYTES);
    leftover = buf.subarray(usable);
    if (usable > 0) {
      const copy = new Uint8Array(usable);
      copy.set(buf.subarray(0, usable));
      onData(copy.buffer);
    }
  });
  child.on('error', () => {
    if (!current.stopped) onEnd();
  });
  child.on('close', () => {
    if (capture === current) capture = null;
    if (!current.stopped) onEnd();
  });
}

module.exports = { isSupported, listWindows, start, stop };
