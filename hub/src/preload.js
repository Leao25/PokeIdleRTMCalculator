// Ponte entre a tela do hub e o motor: só estes pedidos, nada mais.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  inicio: () => ipcRenderer.invoke('hub:inicio'),
  layout: (rects) => ipcRenderer.send('hub:layout', rects),
  adicionar: (i) => ipcRenderer.send('hub:adicionar', i),
  remover: (i, sairDaConta) => ipcRenderer.invoke('hub:remover', i, !!sairDaConta),
  mudo: (i) => ipcRenderer.send('hub:mudo', i),
  recarregar: (i) => ipcRenderer.send('hub:recarregar', i),
  renomear: (i, nome) => ipcRenderer.send('hub:renomear', i, nome),
  focar: (i) => ipcRenderer.send('hub:focar', i),
  tema: (t) => ipcRenderer.send('hub:tema', t),
  baixarVersao: () => ipcRenderer.send('hub:baixar-versao'),
  aoAtualizacao: (fn) => ipcRenderer.on('hub:atualizacao', (_e, a) => fn(a)),
  sniperLigar: (i) => ipcRenderer.send('hub:sniper-ligar', i),
  sniperAcao: (a) => ipcRenderer.send('hub:sniper-acao', a),
  aoStatus: (fn) => ipcRenderer.on('hub:status', (_e, s) => fn(s)),
  aoSniper: (fn) => ipcRenderer.on('hub:sniper', (_e, s) => fn(s)),
  aoSniperPainel: (fn) => ipcRenderer.on('hub:sniper-painel', (_e, html) => fn(html)),
  aoEsc: (fn) => ipcRenderer.on('hub:esc', () => fn()),
  aoAtalho: (fn) => ipcRenderer.on('hub:atalho', (_e, i) => fn(i)),
  aoTeste: (fn) => ipcRenderer.on('hub:teste', (_e, acao, i) => fn(acao, i)),
});
