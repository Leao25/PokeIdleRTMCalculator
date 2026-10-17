// Roda em cada conta antes do jogo. Só faz algo na conta escolhida para o Sniper: põe na página o mesmo
// script do Tampermonkey (baixado do site do RMT Calculator pelo hub) e a ponte que ele usa no lugar do
// Tampermonkey — buscar dados SÓ no site do RMT, mandar o painel para a barra do hub e receber os cliques.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

const codigo = ipcRenderer.sendSync('hub:sniper-codigo');
if (codigo) {
  contextBridge.exposeInMainWorld('__rmtHub', {
    get: (url) => ipcRenderer.invoke('hub:sniper-get', String(url)),
    painel: (html) => ipcRenderer.send('hub:sniper-painel', String(html)),
    aoAcao: (fn) => { ipcRenderer.on('hub:sniper-acao', (_e, a) => fn(a)); },
  });
  webFrame.executeJavaScript(codigo).catch(() => { /* sem Sniper nesta carga */ });
}
