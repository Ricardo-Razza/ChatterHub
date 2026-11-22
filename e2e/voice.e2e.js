const { chromium } = require('playwright-core');

const API = 'http://localhost:8080/api';
const APP = 'http://localhost:4200';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
};

async function api(path, method, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 250) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (_) {}
    await sleep(step);
  }
  return false;
}

const INIT_SCRIPT = `
  window.__pcs = [];
  const Orig = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...a) { const pc = new Orig(...a); window.__pcs.push(pc); return pc; };
  window.RTCPeerConnection.prototype = Orig.prototype;
`;

async function pcStats(page) {
  return page.evaluate(async () => {
    const out = [];
    for (const pc of window.__pcs) {
      if (pc.connectionState === 'closed') continue;
      const rep = await pc.getStats();
      const s = { state: pc.connectionState, audioIn: 0, videoIn: 0 };
      rep.forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'audio') s.audioIn += r.bytesReceived || 0;
        if (r.type === 'inbound-rtp' && r.kind === 'video') s.videoIn += r.bytesReceived || 0;
      });
      out.push(s);
    }
    return out;
  });
}

(async () => {
  const suffix = Math.random().toString(36).slice(2, 8);
  const users = {};
  for (const name of ['alice', 'bob', 'eve']) {
    const r = await api('/users/register', 'POST', null, { username: `${name}_${suffix}`, password: 'senhaSegura123' });
    if (r.status !== 200) throw new Error('register ' + name + ' ' + r.status + JSON.stringify(r.json));
    users[name] = r.json;
  }
  check('registro devolve token', !!users.alice.token);

  // segurança REST
  const noAuth = await api('/users', 'GET', null);
  check('REST sem token é rejeitado (401)', noAuth.status === 401, String(noAuth.status));
  const weak = await api('/users/register', 'POST', null, { username: `weak_${suffix}`, password: '123' });
  check('senha fraca é rejeitada (400)', weak.status === 400, String(weak.status));
  const forgedRole = await api(`/users/${users.eve.user.id}/role`, 'PATCH', users.eve.token, { role: 'ADMIN' });
  check('MEMBER não vira ADMIN sozinho (403)', forgedRole.status === 403, String(forgedRole.status));
  const otherProfile = await api(`/users/${users.alice.user.id}/profile`, 'PUT', users.eve.token, { username: 'hacked' });
  check('não edita perfil de outra pessoa (403)', otherProfile.status === 403, String(otherProfile.status));

  const server = (await api('/servers', 'POST', users.alice.token, { name: `Teste ${suffix}` })).json;
  const inv = (await api(`/servers/${server.id}/invites`, 'POST', users.alice.token)).json;
  await api(`/invites/${inv.code}/accept`, 'POST', users.bob.token);
  const channels = (await api(`/servers/${server.id}/channels`, 'GET', users.alice.token)).json;
  const voice = channels.find((c) => c.type === 'voice');
  const text = channels.find((c) => c.type === 'text');
  const eveChannels = await api(`/servers/${server.id}/channels`, 'GET', users.eve.token);
  check('não-membro não lista canais (403)', eveChannels.status === 403, String(eveChannels.status));
  const eveMsgs = await api(`/channels/${text.id}/messages`, 'GET', users.eve.token);
  check('não-membro não lê mensagens (403)', eveMsgs.status === 403, String(eveMsgs.status));
  const eveCreate = await api('/channels', 'POST', users.bob.token, { name: 'x', type: 'TEXT', serverId: server.id });
  check('membro comum não cria canal (403)', eveCreate.status === 403, String(eveCreate.status));
  const ice = await api('/voice/ice-servers', 'GET', users.bob.token);
  check('ice-servers devolve STUN', ice.status === 200 && ice.json.iceServers.length >= 1, JSON.stringify(ice.json));

  if (process.env.SFU) {
    const sfuRes = await api(`/voice/sfu?channelId=${voice.id}`, 'GET', users.bob.token);
    check('SFU configurado na API (token LiveKit)', sfuRes.status === 200 && !!sfuRes.json.token, String(sfuRes.status));
  }
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: false,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--auto-select-tab-capture-source-by-title=SHARE-ME',
      '--auto-accept-this-tab-capture',
      '--window-size=1100,800',
    ],
  });

  async function openUser(who) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 750 } });
    await ctx.grantPermissions(['microphone', 'camera'], { origin: APP });
    await ctx.addInitScript(INIT_SCRIPT);
    const u = users[who];
    await ctx.addInitScript(
      ([token, user]) => {
        sessionStorage.setItem('ch_token', token);
        sessionStorage.setItem('ch_user', JSON.stringify(user));
      },
      [u.token, { id: u.user.id, username: u.user.username, avatarUrl: u.user.avatarUrl, status: 'online', role: u.user.role }]
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(APP);
    return { ctx, page, errors };
  }

  const A = await openUser('alice');
  const B = await openUser('bob');

  const joinVoice = async (p) => {
    await p.getByRole('button', { name: 'Sala Geral' }).click({ timeout: 20000 });
  };
  await joinVoice(A.page);
  const presenceSeen = await waitFor(async () => (await B.page.locator('aside').getByText(users.alice.user.username).count()) > 0, 10000);
  check('presença: B vê A no canal de voz antes de entrar', presenceSeen);
  await joinVoice(B.page);

  const bothSeeTwo = await waitFor(async () => {
    const a = await A.page.getByText('2 conectado(s)').count();
    const b = await B.page.getByText('2 conectado(s)').count();
    return a > 0 && b > 0;
  }, 20000);
  check('presença: ambos veem 2 participantes (roster do servidor)', bothSeeTwo);

  const connected = await waitFor(async () => {
    const a = await pcStats(A.page);
    const b = await pcStats(B.page);
    return a.length >= 1 && b.length >= 1 && a.every((c) => c.state === 'connected') && b.every((c) => c.state === 'connected');
  }, 25000);
  check('WebRTC conectado nos dois lados (perfect negotiation, sem glare travado)', connected);

  const audioFlows = await waitFor(async () => {
    const a = await pcStats(A.page);
    const b = await pcStats(B.page);
    const sum = (l) => l.reduce((t, c) => t + c.audioIn, 0);
    return sum(a) > 2000 && sum(b) > 2000;
  }, 20000);
  check('áudio do microfone chega nos dois sentidos', audioFlows);

  // Estados propagados
  await A.page.getByLabel('Ativar/desativar microfone').click();
  const muteVisible = await waitFor(async () => (await B.page.locator('app-user-card lucide-icon[name="mic-off"]').count()) > 0, 8000);
  check('mute de A aparece para B', muteVisible);
  await A.page.getByLabel('Ativar/desativar microfone').click();

  // Câmera
  await A.page.getByLabel('Ativar/desativar câmera').click();
  const camOk = await waitFor(
    async () =>
      B.page.evaluate(() => [...document.querySelectorAll('app-user-card video')].some((v) => v.videoWidth > 0 && v.srcObject)),
    20000
  );
  check('câmera de A renderiza em B', camOk);
  await A.page.getByLabel('Ativar/desativar câmera').click();
  const camGone = await waitFor(
    async () => B.page.evaluate(() => ![...document.querySelectorAll('app-user-card video')].some((v) => v.videoWidth > 0)),
    8000
  );
  check('câmera desligada some em B (replaceTrack(null), sem renegociar)', camGone);

  // Transmissão de tela (aba "SHARE-ME")
  const share = await A.ctx.newPage();
  await share.goto('data:text/html,<title>SHARE-ME</title><body style="background:#2a6;font-size:80px">SHARE ME</body>');
  await A.page.bringToFront();
  await A.page.getByLabel('Compartilhar tela').click();
  const screenOk = await waitFor(
    async () => B.page.evaluate(() => [...document.querySelectorAll('app-voice-grid video')].some((v) => v.videoWidth > 0)),
    25000
  );
  check('tela compartilhada de A renderiza em B', screenOk);
  const liveLabel = await B.page.getByText('Ao vivo').count();
  check('B mostra o selo "Ao vivo"', liveLabel > 0);

  // Navegar para canal de texto não derruba a call
  await A.page.getByRole('button', { name: 'geral' }).first().click();
  await sleep(1500);
  const stillInCall = await A.page.getByText('Voz conectada').count();
  const bStillTwo = await B.page.getByText('2 conectado(s)').count();
  check('navegar para canal de texto mantém a chamada (A)', stillInCall > 0);
  check('B continua vendo A na sala', bStillTwo > 0);

  // Queda e volta do WebSocket/rede: janela de graça preserva a sala
  await A.ctx.setOffline(true);
  await sleep(2500);
  await A.ctx.setOffline(false);
  const recovered = await waitFor(async () => {
    const a = await A.page.getByText('Voz conectada').count();
    const stats = await pcStats(B.page);
    return a > 0 && stats.some((s) => s.state === 'connected');
  }, 30000);
  check('recupera após queda de rede curta', recovered);

  const rosterAfter = await waitFor(async () => {
    A.page.getByRole('button', { name: /Voz conectada/ }).click().catch(() => {});
    return (await B.page.getByText('2 conectado(s)').count()) > 0;
  }, 15000);
  check('sala continua com 2 após a queda', rosterAfter);

  // Sair da call remove o participante
  await A.page.getByLabel('Desconectar da chamada').click();
  const left = await waitFor(async () => (await B.page.getByText('1 conectado(s)').count()) > 0, 10000);
  check('sair da call atualiza B para 1 participante', left);

  const errs = [...A.errors, ...B.errors].filter((e) => !/ResizeObserver/.test(e));
  check('sem erros de JS não tratados nas páginas', errs.length === 0, errs.slice(0, 2).join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('E2E abortou:', e);
  process.exit(2);
});
