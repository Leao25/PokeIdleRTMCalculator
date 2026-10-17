// Gera src/icone.png (256×256, fundo transparente) a partir da logo Deck, nas cores do tema Ametista.
// Rodar com:  npx electron ferramentas/gerar-icone.js
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">
<rect x="14" y="10" width="28" height="40" rx="6" transform="rotate(-16 28 50)" fill="#3a2e4d"/>
<rect x="22" y="10" width="28" height="40" rx="6" transform="rotate(14 36 50)" fill="#b77cff"/>
<rect x="18" y="12" width="28" height="40" rx="6" fill="#f36cb8"/>
<path d="M28 25.5v13l10.5-6.5z" fill="#1a1324"/>
<circle cx="32" cy="46.5" r="1.6" fill="#1a1324"/><circle cx="26.5" cy="46.5" r="1.1" fill="#1a1324" opacity=".6"/><circle cx="37.5" cy="46.5" r="1.1" fill="#1a1324" opacity=".6"/>
</svg>`;

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 256, height: 256, show: false, transparent: true, frame: false, backgroundColor: '#00000000', useContentSize: true,
    webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${SVG}</body></html>`));
  await new Promise((ok) => setTimeout(ok, 500));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const destino = path.join(__dirname, '..', 'src', 'icone.png');
  fs.writeFileSync(destino, img.resize({ width: 256, height: 256 }).toPNG());
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'icone.svg'), SVG);
  console.log('ícone gravado em', destino, img.getSize());
  app.quit();
});
