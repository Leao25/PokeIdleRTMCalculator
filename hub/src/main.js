// IdleDeck (by Leão): até 4 contas de jogos idle de navegador numa janela só. Cada quadrado é um navegador à
// parte, com o login guardado numa partição própria (persist:conta1…4), como se fossem 4 navegadores
// diferentes. No "+" a pessoa escolhe o jogo (JOGOS, abaixo; por enquanto só o PokeIdle).
//
// O que o hub NÃO faz: não lê nem guarda senha ou token, não joga sozinho, não clica em nada no jogo.
// Ele só lê o NICK (para mostrar na barra) e se a conta está logada ou pausada ("Conta aberta em outro
// lugar"), a cada 5 s.
//
// SNIPER: o mesmo script do Tampermonkey (docs/sniper-ao-vivo.user.js do RMT Calculator), baixado do site
// pelo hub a cada hora, roda na conta escolhida; o painel dele aparece na barra do hub.
const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// As contas continuam rodando quando estão fora de foco, minimizadas ou atrás de outra janela: sem isto o
// Chromium atrasa os relógios das abas escondidas, e a conta pode cair (o servidor só segura a hunt 90 s).
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// O programa se chamava "PokeIdle Hub": a pasta dos logins (userData) tinha esse nome. Na primeira vez como
// IdleDeck, a pasta antiga muda de nome, para ninguém perder os logins. Antes do app ficar pronto.
// O teste automático usa uma pasta própria e nunca mexe na dos logins de verdade.
if (process.argv.includes('--teste')) app.setPath('userData', path.join(app.getPath('appData'), 'IdleDeck-teste'));
else try {
  // HUB_APPDATA: só para testar esta migração numa pasta falsa
  if (process.env.HUB_APPDATA) { app.setPath('appData', process.env.HUB_APPDATA); app.setPath('userData', path.join(process.env.HUB_APPDATA, 'IdleDeck')); }
  const nova = app.getPath('userData'), antiga = path.join(app.getPath('appData'), 'PokeIdle Hub');
  // a pasta nova pode já existir vazia (o Electron cria cedo): o que vale é ela ainda não ter o hub.json
  if (fs.existsSync(antiga) && !fs.existsSync(path.join(nova, 'hub.json'))) {
    fs.cpSync(antiga, nova, { recursive: true, force: false, errorOnExist: false });
    fs.renameSync(antiga, antiga + ' (migrado para IdleDeck)');
  }
} catch { /* se não der, começa do zero */ }

// Os jogos que o deck abre. status: sabe ler nick/logado/pausado; sniper: o Sniper do site funciona nele.
const JOGOS = {
  pokeidle: { nome: 'PokeIdle', url: 'https://pokeidle.io/app', hosts: ['pokeidle.io'], status: true, sniper: true },
};

const TESTE = process.argv.includes('--teste');
const SITE = (TESTE && process.env.HUB_SITE) || 'https://pokeidle-rmt-calculator.vercel.app';
const N = 4;
// o teste automático usa compartimentos próprios, longe dos logins de verdade
const particao = (i) => `persist:${TESTE ? 'teste' : 'conta'}${i + 1}`;
const TEMAS = ['ametista', 'turquesa', 'jade'];
const TEMA_ANTIGO = { lavender: 'ametista', mahogany: 'turquesa', celadon: 'jade' };
let ARQ_ESTADO, ARQ_SNIPER;

let janela = null;
const views = new Array(N).fill(null);
const visivel = new Array(N).fill(false); // o Electron 33 não tem view.getVisible()
let slots = Array.from({ length: N }, () => ({ ativo: false, nome: '', mudo: false, jogo: 'pokeidle' }));
let cfg = { tema: 'ametista', sniperConta: null };
const status = Array.from({ length: N }, () => ({ nick: null, logado: false, pausada: false, carregando: false, desde: null }));

function lerEstado() {
  try {
    const s = JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8'));
    if (Array.isArray(s.slots)) slots = slots.map((x, i) => ({ ...x, ...s.slots[i] }));
    if (s.cfg) cfg = { ...cfg, ...s.cfg };
  } catch { /* primeira vez */ }
  cfg.tema = TEMA_ANTIGO[cfg.tema] || cfg.tema;
  if (!TEMAS.includes(cfg.tema)) cfg.tema = 'ametista';
  slots.forEach((s) => { if (!JOGOS[s.jogo]) s.jogo = 'pokeidle'; });
  if (!(cfg.sniperConta >= 0 && cfg.sniperConta < N && slots[cfg.sniperConta]?.ativo && JOGOS[slots[cfg.sniperConta].jogo]?.sniper)) cfg.sniperConta = null;
}
function salvarEstado() {
  try { fs.writeFileSync(ARQ_ESTADO, JSON.stringify({ slots, cfg }, null, 1)); } catch { /* sem disco: segue */ }
}

const jogoDe = (i) => JOGOS[slots[i]?.jogo] || JOGOS.pokeidle;
// o endereço do jogo (no teste automático, HUB_JOGO troca pelo jogo falso local)
const urlDoJogo = (i) => (TESTE && process.env.HUB_JOGO) || jogoDe(i).url;
const ehDoJogo = (url, i) => {
  try {
    const u = new URL(url);
    if (TESTE && process.env.HUB_JOGO && u.origin === new URL(process.env.HUB_JOGO).origin) return true;
    return u.protocol === 'https:' && jogoDe(i).hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
};
const abrirFora = (url) => { try { const u = new URL(url); if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(url); } catch { /* ignora */ } };
const contaDe = (wc) => views.findIndex((v) => v && v.webContents === wc);

// ---------- o código do Sniper (baixado do site; o último que deu certo fica guardado no disco) ----------
let sniper = { codigo: null, versao: null, em: 0 };
// o que o Tampermonkey dava ao script: a própria janela e o GM_xmlhttpRequest (aqui, pela ponte do hub)
const SHIM = `window.unsafeWindow = window;
window.GM_xmlhttpRequest = (o) => { window.__rmtHub.get(o.url).then((t) => o.onload && o.onload({ responseText: t, status: 200 }), (e) => o.onerror && o.onerror(e)); };\n`;
async function baixarSniper() {
  try {
    const pegar = async (arq) => { const r = await net.fetch(`${SITE}/${arq}?t=${Date.now()}`); if (!r.ok) throw new Error(`${arq}: ${r.status}`); return r.text(); };
    const [preco, modelo, script] = await Promise.all([pegar('preco.js'), pegar('modelo-preco.js'), pegar('sniper-ao-vivo.user.js')]);
    const versao = (script.match(/@version\s+([\d.]+)/) || [])[1] || '?';
    sniper = { codigo: `${SHIM}\n${preco}\n;\n${modelo}\n;\n${script}`, versao, em: Date.now() };
    fs.writeFileSync(ARQ_SNIPER, JSON.stringify(sniper));
  } catch { /* sem internet: segue com o guardado */ }
  avisarSniper();
}
// ---------- versão nova do hub: o site publica hub.json { versao, url } ----------
let atualizacao = null;
const maior = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function verAtualizacao() {
  try {
    const r = await net.fetch(`${SITE}/hub.json?t=${Date.now()}`); if (!r.ok) return;
    const h = await r.json();
    if (h?.versao && maior(h.versao, app.getVersion())) { atualizacao = { versao: String(h.versao), notas: String(h.notas || '').slice(0, 300) }; janela?.webContents.send('hub:atualizacao', atualizacao); }
  } catch { /* sem internet */ }
}
const PAGINA_HUB = 'https://pokeidle-rmt-calculator.vercel.app/#hub';
function avisarSniper() { janela?.webContents.send('hub:sniper', { conta: cfg.sniperConta, versao: sniper.versao, pronto: !!sniper.codigo }); }

function criarView(i) {
  const v = new WebContentsView({
    webPreferences: { partition: particao(i), preload: path.join(__dirname, 'preload-jogo.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  views[i] = v;
  const wc = v.webContents;
  wc.setAudioMuted(!!slots[i].mudo);
  // links para fora do jogo (Discord, Twitch, o Laudo do Sniper…) abrem no navegador do sistema
  wc.setWindowOpenHandler(({ url }) => { if (!ehDoJogo(url, i)) abrirFora(url); return { action: 'deny' }; });
  wc.on('will-navigate', (ev, url) => { if (!ehDoJogo(url, i)) { ev.preventDefault(); abrirFora(url); } });
  wc.on('did-start-loading', () => { status[i].carregando = true; avisar(i); });
  wc.on('did-stop-loading', () => { status[i].carregando = false; avisar(i); lerStatus(i); });
  // Esc dentro do jogo também sai da tela cheia (o jogo não usa Esc para nada que o hub atrapalhe)
  wc.on('before-input-event', (ev, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') janela?.webContents.send('hub:esc');
    if (input.type === 'keyDown' && input.control && /^[1-4]$/.test(input.key)) { janela?.webContents.send('hub:atalho', Number(input.key) - 1); ev.preventDefault(); }
  });
  wc.loadURL(urlDoJogo(i));
  janela.contentView.addChildView(v);
  v.setVisible(false);
}

function avisar(i) { const j = jogoDe(i); janela?.webContents.send('hub:status', { i, ...status[i], ativo: !!slots[i].ativo, mudo: !!slots[i].mudo, nome: slots[i].nome, jogo: slots[i].jogo, jogoNome: j.nome, temSniper: !!j.sniper }); }

// Só o nick e dois sim/não: nada de token.
const LER_STATUS = `(() => {
  let s = null; try { s = JSON.parse(localStorage.getItem('sessao') || 'null'); } catch (e) {}
  const t = document.getElementById('sessao-tomada');
  return { nick: (s && s.nick) || localStorage.getItem('nick') || null, logado: !!(s && s.token), pausada: !!(t && !t.classList.contains('hidden')) };
})()`;
async function lerStatus(i) {
  const v = views[i];
  if (!v || v.webContents.isDestroyed() || v.webContents.isLoading() || !jogoDe(i).status) return;
  try {
    const r = await v.webContents.executeJavaScript(LER_STATUS, true);
    const st = status[i];
    const ok = r.logado && !r.pausada;
    st.nick = r.nick ? String(r.nick).slice(0, 24) : null; st.logado = !!r.logado; st.pausada = !!r.pausada;
    if (ok && !st.desde) st.desde = Date.now();
    if (!ok) st.desde = null;
    avisar(i);
  } catch { /* página trocando */ }
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1600, height: 960, minWidth: 900, minHeight: 600, backgroundColor: '#17121f', title: 'IdleDeck',
    icon: path.join(__dirname, 'icone.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  janela.removeMenu();
  janela.loadFile(path.join(__dirname, 'index.html'));
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', (ev) => ev.preventDefault());
  janela.webContents.once('did-finish-load', () => {
    slots.forEach((s, i) => { if (s.ativo) criarView(i); });
    for (let i = 0; i < N; i++) avisar(i);
    avisarSniper();
    if (atualizacao) janela.webContents.send('hub:atualizacao', atualizacao);
    if (TESTE) roteiroDeTeste();
  });
  janela.on('closed', () => { janela = null; });
}

// ---------- pedidos da tela ----------
ipcMain.handle('hub:inicio', () => ({ jogos: Object.entries(JOGOS).map(([id, j]) => ({ id, nome: j.nome, site: j.hosts[0], sniper: !!j.sniper })), contas: slots.map((s, i) => ({ i, ...s, ...status[i], jogoNome: jogoDe(i).nome, temSniper: !!jogoDe(i).sniper })), cfg, sniper: { conta: cfg.sniperConta, versao: sniper.versao, pronto: !!sniper.codigo } }));
ipcMain.on('hub:layout', (_e, rects) => {
  // rects[i] = {x, y, w, h} do corpo do quadrado, ou null (quadrado escondido / vazio)
  for (let i = 0; i < N; i++) {
    const v = views[i], r = rects?.[i];
    if (!v) continue;
    if (r && r.w > 10 && r.h > 10) { v.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h) }); v.setVisible(true); visivel[i] = true; }
    else { v.setVisible(false); visivel[i] = false; }
  }
});
ipcMain.on('hub:adicionar', (_e, i, jogo) => {
  if (!(i >= 0 && i < N) || views[i]) return;
  const novo = JOGOS[jogo] ? jogo : 'pokeidle';
  // trocou de jogo no mesmo quadrado: o login guardado era de outro jogo, começa limpo
  if (slots[i].jogo && slots[i].jogo !== novo) session.fromPartition(particao(i)).clearStorageData().catch(() => {});
  slots[i] = { ativo: true, nome: slots[i].jogo === novo ? slots[i].nome || '' : '', mudo: false, jogo: novo };
  salvarEstado(); criarView(i); avisar(i);
});
ipcMain.handle('hub:remover', async (_e, i, sairDaConta) => {
  if (!(i >= 0 && i < N)) return;
  const v = views[i];
  if (v) { janela.contentView.removeChildView(v); v.webContents.close(); views[i] = null; }
  if (sairDaConta) await session.fromPartition(particao(i)).clearStorageData();
  slots[i] = { ativo: false, nome: sairDaConta ? '' : slots[i].nome, mudo: false, jogo: slots[i].jogo };
  Object.assign(status[i], { nick: null, logado: false, pausada: false, carregando: false, desde: null });
  if (cfg.sniperConta === i) { cfg.sniperConta = null; avisarSniper(); }
  salvarEstado(); avisar(i);
});
ipcMain.on('hub:mudo', (_e, i) => {
  if (!(i >= 0 && i < N)) return;
  slots[i].mudo = !slots[i].mudo; views[i]?.webContents.setAudioMuted(slots[i].mudo); salvarEstado(); avisar(i);
});
ipcMain.on('hub:recarregar', (_e, i) => { views[i]?.webContents.reload(); });
ipcMain.on('hub:renomear', (_e, i, nome) => { if (i >= 0 && i < N) { slots[i].nome = String(nome || '').slice(0, 24); salvarEstado(); avisar(i); } });
ipcMain.on('hub:focar', (_e, i) => { views[i]?.webContents.focus(); });
ipcMain.on('hub:baixar-versao', () => shell.openExternal(PAGINA_HUB));
ipcMain.on('hub:tema', (_e, t) => { if (TEMAS.includes(t)) { cfg.tema = t; salvarEstado(); } });

// ---------- Sniper ----------
// liga (numa conta) ou desliga (null): a conta antiga e a nova recarregam, para o script entrar ou sair
ipcMain.on('hub:sniper-ligar', (_e, i) => {
  const nova = i >= 0 && i < N && slots[i].ativo && jogoDe(i).sniper ? i : null, antiga = cfg.sniperConta;
  if (nova === antiga) return;
  cfg.sniperConta = nova; salvarEstado(); avisarSniper();
  for (const c of new Set([antiga, nova])) if (c != null) views[c]?.webContents.reload();
});
// a conta pergunta, antes do jogo carregar, se é ela que roda o Sniper
ipcMain.on('hub:sniper-codigo', (e) => { e.returnValue = contaDe(e.sender) === cfg.sniperConta && cfg.sniperConta != null ? sniper.codigo : null; });
// o Sniper só busca dados no site do RMT Calculator
ipcMain.handle('hub:sniper-get', async (e, url) => {
  // no teste, o endereço do site (fixo no script) vira o servidor local
  if (TESTE && process.env.HUB_SITE) url = String(url).replace('https://pokeidle-rmt-calculator.vercel.app', SITE);
  if (contaDe(e.sender) !== cfg.sniperConta || !String(url).startsWith(SITE + '/')) throw new Error('fora do site');
  const r = await net.fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
});
ipcMain.on('hub:sniper-painel', (e, html) => { if (contaDe(e.sender) === cfg.sniperConta) janela?.webContents.send('hub:sniper-painel', String(html).slice(0, 400000)); });
ipcMain.on('hub:sniper-acao', (_e, a) => { if (cfg.sniperConta != null && a && typeof a === 'object') views[cfg.sniperConta]?.webContents.send('hub:sniper-acao', a); });

// ---------- teste automático (npm run teste): abre 2 quadrados, troca de modo e fotografa ----------
async function roteiroDeTeste() {
  const saida = path.join(app.getPath('temp'), 'pokeidle-hub-teste');
  fs.mkdirSync(saida, { recursive: true });
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const log = (t) => fs.appendFileSync(path.join(saida, 'log.txt'), t + '\n');
  const foto = async (nome) => {
    fs.writeFileSync(path.join(saida, `${nome}-tela.png`), (await janela.webContents.capturePage()).toPNG());
    for (let i = 0; i < N; i++) if (views[i] && visivel[i]) {
      fs.writeFileSync(path.join(saida, `${nome}-conta${i + 1}.png`), (await views[i].webContents.capturePage()).toPNG());
      log(`${nome} conta${i + 1} bounds ${JSON.stringify(views[i].getBounds())}`);
    }
  };
  fs.writeFileSync(path.join(saida, 'log.txt'), '');
  ipcMain.on('hub:sniper-painel', (_e, html) => { log(`painel do Sniper: ${String(html).length} caracteres, ${(String(html).match(/% lucro/g) || []).length} achados, revenda paciência ligada: ${/data-v="paciencia" class="on"/.test(html)}`); });
  const tema = process.env.HUB_TEMA;
  await espera(1500);
  if (tema) janela.webContents.send('hub:teste', 'tema', tema);
  janela.webContents.send('hub:teste', 'adicionar', 0); await espera(300);
  janela.webContents.send('hub:teste', 'adicionar', 2); await espera(4000);
  janela.webContents.send('hub:teste', 'escolher', 1); await espera(800);
  fs.writeFileSync(path.join(saida, '0-escolher-jogo.png'), (await janela.webContents.capturePage()).toPNG());
  janela.webContents.send('hub:teste', 'esc'); await espera(500);
  if (process.env.HUB_SNIPER) {
    janela.webContents.send('hub:teste', 'sniper', 0); await espera(40000);
    await foto('0-sniper');
    janela.webContents.send('hub:teste', 'sniper-acao', 0); await espera(2500);
  } else await espera(5000);
  await foto('1-grade');
  janela.webContents.send('hub:teste', 'mudo', 2); await espera(500);
  janela.webContents.send('hub:teste', 'cheia', 2); await espera(1500);
  await foto('2-tela-cheia');
  janela.webContents.send('hub:teste', 'esc'); await espera(1500);
  await foto('3-volta-grade');
  log(`status ${JSON.stringify(status)}\nslots ${JSON.stringify(slots)}\ncfg ${JSON.stringify(cfg)}\nsniper versao ${sniper.versao}`);
  // o teste não deixa login nenhum guardado
  for (let i = 0; i < N; i++) await session.fromPartition(particao(i)).clearStorageData();
  app.quit();
}

app.whenReady().then(() => {
  ARQ_ESTADO = path.join(app.getPath('userData'), TESTE ? 'hub-teste.json' : 'hub.json');
  ARQ_SNIPER = path.join(app.getPath('userData'), 'sniper-cache.json');
  if (TESTE) { try { fs.unlinkSync(ARQ_ESTADO); } catch { /* ok */ } }
  lerEstado();
  try { const s = JSON.parse(fs.readFileSync(ARQ_SNIPER, 'utf8')); if (s.codigo) sniper = s; } catch { /* ainda não baixou */ }
  // permissões que o jogo não precisa: nega (câmera, microfone, localização…); notificação fica
  for (let i = 0; i < N; i++) session.fromPartition(particao(i)).setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'notifications' || perm === 'clipboard-sanitized-write'));
  criarJanela();
  baixarSniper();
  setInterval(baixarSniper, 3600e3);
  verAtualizacao();
  setInterval(verAtualizacao, 6 * 3600e3);
  setInterval(() => { for (let i = 0; i < N; i++) lerStatus(i); }, 5000);
});
app.on('window-all-closed', () => app.quit());
