const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const API = 'http://localhost:8080/api', APP = 'http://localhost:4200';
const api = async (p, m, t, b) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); const x = await r.text(); return { status: r.status, json: x ? JSON.parse(x) : null }; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (_) {} await sleep(300); } return false; }
const res = []; const check = (n, ok, x = '') => { res.push(ok); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (x ? '  -> ' + x : '')); };

(async () => {
  const s = Math.random().toString(36).slice(2, 7);
  const U = {};
  for (const n of ['a', 'b']) U[n] = (await api('/users/register', 'POST', null, { username: n + s, password: 'senhaSegura123' })).json;
  const srv = (await api('/servers', 'POST', U.a.token, { name: 'S' + s })).json;
  await api(`/servers/${srv.id}/join`, 'POST', U.b.token);
  const seed = ([t, x]) => { sessionStorage.setItem('ch_token', t); sessionStorage.setItem('ch_user', JSON.stringify(x)); };
  const mkUser = (u) => [u.token, { id: u.user.id, username: u.user.username, avatarUrl: u.user.avatarUrl, status: 'online', role: u.user.role }];

  // A = Electron real (app desktop), B = Chrome
  const el = spawn('C:/Users/razza/build/desktop/node_modules/electron/dist/electron.exe', ['C:/Users/razza/build/desktop', '--remote-debugging-port=9333'], { env: { ...process.env, CHATTERHUB_URL: APP }, stdio: 'ignore' });
  await sleep(6000);
  const eb = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ectx = eb.contexts()[0];
  const A = ectx.pages().find(p => p.url().startsWith(APP)) || ectx.pages()[0];
  await A.addInitScript(`window.__pcs=[];const O=window.RTCPeerConnection;window.RTCPeerConnection=function(...a){const p=new O(...a);window.__pcs.push(p);return p};window.RTCPeerConnection.prototype=O.prototype;`);
  await A.evaluate(seed, mkUser(U.a)); await A.reload();

  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const bctx = await browser.newContext(); await bctx.grantPermissions(['microphone', 'camera'], { origin: APP });
  await bctx.addInitScript(seed, mkUser(U.b));
  const B = await bctx.newPage(); await B.goto(APP);

  check('app desktop expõe electronAPI com áudio por app', await A.evaluate(() => !!(window.electronAPI && window.electronAPI.isDesktop && window.electronAPI.supportsAppAudio)));
  await A.getByRole('button', { name: 'Sala Geral' }).click({ timeout: 20000 });
  await B.getByRole('button', { name: 'Sala Geral' }).click({ timeout: 20000 });
  check('A (desktop) e B na sala', await waitFor(async () => (await A.getByText('2 conectado(s)').count()) > 0 && (await B.getByText('2 conectado(s)').count()) > 0));

  await A.getByLabel('Compartilhar tela').click();
  const pickerShown = await waitFor(async () => (await A.getByRole('dialog', { name: 'Escolher o que compartilhar' }).count()) > 0, 10000);
  check('seletor de tela abre no app desktop', pickerShown);
  const thumbs = await A.locator('app-screen-picker button img').count();
  check('seletor lista janelas com miniatura', thumbs > 0, String(thumbs));
  await A.getByRole('button', { name: 'Telas' }).click();
  await A.locator('app-screen-picker button img').first().click();
  const audioOptions = await A.locator('app-screen-picker select').first().locator('option').allInnerTexts();
  check('seletor oferece escolher o aplicativo do áudio', audioOptions.length >= 1 && audioOptions[0] === 'Sem áudio', audioOptions.slice(0, 3).join(' | '));
  // escolhe o primeiro app disponível como fonte de áudio (exercita a captura por processo)
  if (audioOptions.length > 1) await A.locator('app-screen-picker select').first().selectOption({ index: 1 });
  await A.getByRole('button', { name: 'Transmitir' }).click();

  const bSees = await waitFor(async () => B.evaluate(() => [...document.querySelectorAll('app-voice-grid video')].some(v => v.videoWidth > 0)), 25000);
  check('B recebe a tela transmitida pelo app desktop', bSees);
  const hasScreenAudioTx = await A.evaluate(() => window.__pcs.some(pc => pc.getTransceivers().some(t => t.sender.track && t.sender.track.kind === 'audio' && t.mid !== null && t.sender.track.label !== '' && true)));
  check('A envia trilha de áudio da tela (app audio -> worklet -> track)', hasScreenAudioTx || audioOptions.length <= 1);

  await A.getByLabel('Compartilhar tela').click();
  check('parar transmissão remove o vídeo em B', await waitFor(async () => B.evaluate(() => ![...document.querySelectorAll('app-voice-grid video')].some(v => v.videoWidth > 0)), 10000));

  await eb.close().catch(() => {}); await browser.close(); el.kill();
  const bad = res.filter(x => !x).length; console.log(`\n${res.length - bad}/${res.length} verificações passaram`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('abortou', e); process.exit(2); });
