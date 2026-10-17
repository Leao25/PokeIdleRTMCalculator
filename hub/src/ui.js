// A tela do hub: barra das contas à esquerda (com o Sniper), grade 2×2 (ou uma conta em tela cheia) à direita.
// Os jogos são janelas do motor (main.js) posicionadas por cima do "corpo" de cada quadrado; esta tela manda
// as posições sempre que algo muda de tamanho.
(() => {
  const N = 4;
  const $ = (id) => document.getElementById(id);
  const estado = Array.from({ length: N }, (_, i) => ({ i, ativo: false, nome: '', mudo: false, nick: null, logado: false, pausada: false, carregando: false, desde: null }));
  let foco = null;        // índice da conta em tela cheia, ou null (grade)
  let modalAberto = false;
  let sniper = { conta: null, versao: null, pronto: false }, painelSniper = '';
  const NOMES_TEMA = { lavender: 'Lavender Town', mahogany: 'Mahogany Town', celadon: 'Celadon City' };

  const ICONES = {
    som: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
    mudo: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>',
    cheia: '<svg viewBox="0 0 24 24"><path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M16 21h5v-5"/></svg>',
    sair: '<svg viewBox="0 0 24 24"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/></svg>',
    recarregar: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    fechar: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  };

  const nomeDe = (s) => s.nome || s.nick || `Conta ${s.i + 1}`;
  function situacao(s) {
    if (!s.ativo) return { cor: null, txt: 'vazio · clique no + para adicionar' };
    if (s.carregando && !s.logado) return { cor: '#8a7fa3', txt: 'carregando…' };
    if (s.pausada) return { cor: 'var(--alerta)', txt: 'pausada · aberta em outro lugar' };
    if (!s.logado) return { cor: 'var(--mudo)', txt: 'faça o login nesta conta' };
    return { cor: 'var(--ok)', txt: `conectada${s.desde ? ` · ligada há ${tempo(Date.now() - s.desde)}` : ''}` };
  }
  function tempo(ms) {
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'menos de 1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), d = Math.floor(h / 24);
    return d ? `${d} d ${h % 24} h` : `${h} h ${min % 60} min`;
  }

  // ---------- montagem ----------
  function montar() {
    $('contas').innerHTML = estado.map((s) => `<button class="conta" data-conta="${s.i}"><span class="num">${s.i + 1}</span><span class="nome"></span><span class="sub"></span></button>`).join('');
    $('grade').innerHTML = estado.map((s) => `<section class="tile" data-tile="${s.i}">
      <header><span class="bolinha"></span><span class="t"></span><span class="alvo-tag" hidden>🎯 Sniper</span><span class="s"></span>
        <span class="acoes">
          <button data-acao="mudo"></button>
          <button data-acao="recarregar" title="Recarregar o jogo">${ICONES.recarregar}</button>
          <button data-acao="cheia"></button>
          <button data-acao="fechar" title="Fechar este quadrado">${ICONES.fechar}</button>
        </span></header>
      <div class="corpo"><button class="mais" data-acao="adicionar" title="Abrir o PokeIdle neste quadrado">+</button><div class="mais-txt">Adicionar conta</div></div>
    </section>`).join('');
    estado.forEach(pintar);
  }
  function pintar(s) {
    const c = document.querySelector(`[data-conta="${s.i}"]`), t = document.querySelector(`[data-tile="${s.i}"]`);
    if (!c || !t) return;
    const sit = situacao(s);
    c.classList.toggle('vazia', !s.ativo); c.classList.toggle('focada', foco === s.i);
    c.style.setProperty('--cor', sit.cor || 'var(--mudo)');
    if (!c.querySelector('input')) c.querySelector('.nome').innerHTML = (s.ativo ? esc(nomeDe(s)) : `Conta ${s.i + 1} (vazia)`) + (sniper.conta === s.i ? ' <span class="alvo" title="O Sniper roda nesta conta">🎯</span>' : '');
    c.querySelector('.sub').textContent = sit.txt;
    t.classList.toggle('vazia', !s.ativo); t.classList.toggle('focada', foco === s.i);
    t.style.setProperty('--cor', sit.cor || 'var(--mudo)');
    t.querySelector('.t').textContent = s.ativo ? nomeDe(s) : `Conta ${s.i + 1}`;
    t.querySelector('.alvo-tag').hidden = sniper.conta !== s.i;
    t.querySelector('.s').textContent = s.ativo ? sit.txt : '';
    t.querySelector('.mais').hidden = s.ativo; t.querySelector('.mais-txt').hidden = s.ativo;
    const bm = t.querySelector('[data-acao="mudo"]');
    bm.innerHTML = s.mudo ? ICONES.mudo : ICONES.som; bm.title = s.mudo ? 'Ligar o som' : 'Mutar'; bm.classList.toggle('on', !!s.mudo);
    const bc = t.querySelector('[data-acao="cheia"]');
    bc.innerHTML = foco === s.i ? ICONES.sair : ICONES.cheia; bc.title = foco === s.i ? 'Voltar para a grade (Esc)' : 'Tela cheia';
    $('btn-grade').disabled = foco === null;
  }
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- posição dos jogos ----------
  let pedido = 0;
  function posicionar() {
    cancelAnimationFrame(pedido);
    pedido = requestAnimationFrame(() => {
      const rects = estado.map((s) => {
        if (modalAberto || !s.ativo || (foco !== null && foco !== s.i)) return null;
        const r = document.querySelector(`[data-tile="${s.i}"] .corpo`).getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
      window.hub.layout(rects);
    });
  }
  new ResizeObserver(posicionar).observe($('grade'));
  window.addEventListener('resize', posicionar);

  function focar(i) {
    foco = i;
    $('grade').classList.toggle('foco', foco !== null);
    estado.forEach(pintar); posicionar();
    if (foco !== null) setTimeout(() => window.hub.focar(foco), 50);
  }

  // ---------- cliques nas contas e nos quadrados ----------
  $('contas').addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-conta]'); if (!c || ev.target.tagName === 'INPUT') return;
    const i = Number(c.dataset.conta);
    if (!estado[i].ativo) { window.hub.adicionar(i); focar(i); return; }
    focar(foco === i ? null : i);
  });
  $('contas').addEventListener('dblclick', (ev) => {
    const c = ev.target.closest('[data-conta]'); if (!c) return;
    const i = Number(c.dataset.conta); if (!estado[i].ativo) return;
    const alvo = c.querySelector('.nome');
    const inp = document.createElement('input'); inp.value = estado[i].nome || ''; inp.placeholder = estado[i].nick || `Conta ${i + 1}`; inp.maxLength = 24;
    alvo.textContent = ''; alvo.appendChild(inp); inp.focus();
    let feito = false;
    const salvar = () => { if (feito) return; feito = true; window.hub.renomear(i, inp.value.trim()); estado[i].nome = inp.value.trim(); inp.remove(); pintar(estado[i]); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') { feito = true; inp.remove(); pintar(estado[i]); } });
    inp.addEventListener('blur', salvar);
  });
  $('grade').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acao]'), t = ev.target.closest('[data-tile]'); if (!b || !t) return;
    const i = Number(t.dataset.tile);
    if (b.dataset.acao === 'adicionar') window.hub.adicionar(i);
    if (b.dataset.acao === 'mudo') window.hub.mudo(i);
    if (b.dataset.acao === 'recarregar') window.hub.recarregar(i);
    if (b.dataset.acao === 'cheia') focar(foco === i ? null : i);
    if (b.dataset.acao === 'fechar') perguntarFechar(i);
  });
  $('btn-grade').onclick = () => focar(null);

  // ---------- janelas (os jogos se escondem enquanto uma está aberta) ----------
  function abrirJanela(id) { modalAberto = true; posicionar(); $(id).hidden = false; }
  function fecharJanelas() { $('modal').hidden = true; $('modal-sniper').hidden = true; modalAberto = false; posicionar(); }
  let fecharQual = null;
  function perguntarFechar(i) {
    fecharQual = i;
    $('modal-titulo').textContent = `Fechar ${nomeDe(estado[i])}?`;
    $('modal-texto').textContent = '"Fechar o quadrado" mantém o login guardado: no + a conta volta já logada. "Sair da conta" apaga o login deste quadrado.';
    abrirJanela('modal');
  }
  $('modal-cancelar').onclick = fecharJanelas;
  $('modal-fechar').onclick = async () => { const i = fecharQual; fecharJanelas(); if (foco === i) focar(null); await window.hub.remover(i, false); };
  $('modal-sair').onclick = async () => { const i = fecharQual; fecharJanelas(); if (foco === i) focar(null); await window.hub.remover(i, true); };

  // ---------- Sniper ----------
  function pintarSniper() {
    document.body.classList.toggle('com-sniper', sniper.conta != null);
    const area = $('sniper-area');
    if (sniper.conta == null) {
      area.innerHTML = `<button id="btn-sniper"><b>🎯 Sniper</b><span>Avisa quando aparece pechincha no Mercado</span></button>`;
      $('btn-sniper').onclick = abrirEscolhaSniper;
    } else {
      const s = estado[sniper.conta];
      if (!area.querySelector('#rmt-sniper')) {
        area.innerHTML = `<div class="sniper-topo"><b></b><button id="sniper-trocar" title="Rodar o Sniper em outra conta">Trocar</button><button id="sniper-desligar" title="Desligar o Sniper">Desligar</button></div><div id="rmt-sniper"></div>`;
        $('sniper-trocar').onclick = abrirEscolhaSniper;
        $('sniper-desligar').onclick = () => window.hub.sniperLigar(null);
      }
      area.querySelector('.sniper-topo b').textContent = `🎯 Sniper · ${nomeDe(s)}${sniper.versao ? ` · v${sniper.versao}` : ''}`;
      const box = $('rmt-sniper');
      if (painelSniper) {
        const rol = box.querySelector('.lista')?.scrollTop ?? 0;
        box.innerHTML = painelSniper;
        const l = box.querySelector('.lista'); if (l && rol) l.scrollTop = rol;
      } else box.innerHTML = `<div class="sniper-vazio">${s.logado ? 'Ligando… o painel aparece em alguns segundos.' : 'Faça o login nesta conta: o Sniper começa assim que o jogo entrar.'}</div>`;
    }
    estado.forEach(pintar);
  }
  function abrirEscolhaSniper() {
    const ativas = estado.filter((s) => s.ativo);
    $('sniper-contas').innerHTML = ativas.length
      ? ativas.map((s) => `<label><input type="radio" name="sniper-conta" value="${s.i}"${(sniper.conta ?? ativas[0].i) === s.i ? ' checked' : ''}> ${esc(nomeDe(s))}<span class="sub">${esc(situacao(s).txt)}</span></label>`).join('')
      : '<p>Adicione uma conta (botão +) e faça o login antes de ligar o Sniper.</p>';
    $('sniper-ligar').disabled = !ativas.length || !sniper.pronto;
    $('sniper-ligar').textContent = sniper.pronto ? (sniper.conta == null ? 'Ligar o Sniper' : 'Trocar de conta') : 'Baixando o Sniper…';
    abrirJanela('modal-sniper');
  }
  $('sniper-cancelar').onclick = fecharJanelas;
  $('sniper-ligar').onclick = () => {
    const r = document.querySelector('input[name="sniper-conta"]:checked'); if (!r) return;
    painelSniper = ''; fecharJanelas(); window.hub.sniperLigar(Number(r.value));
  };
  // cliques no painel mostrado aqui voltam para o Sniper, que roda dentro do jogo
  $('sniper-area').addEventListener('click', (ev) => {
    const b = ev.target.closest('#rmt-sniper [data-acao]'); if (!b) return;
    if (b.tagName === 'INPUT') ev.preventDefault(); // a caixinha muda quando o Sniper redesenhar
    const d = b.dataset;
    window.hub.sniperAcao({ acao: d.acao, v: d.v, id: d.id, k: d.k });
  });
  $('sniper-area').addEventListener('change', (ev) => {
    const s = ev.target.closest('#rmt-sniper [data-cfg]'); if (!s) return;
    window.hub.sniperAcao({ cfg: s.dataset.cfg, valor: s.value });
  });
  window.hub.aoSniper((s) => { const trocou = s.conta !== sniper.conta; sniper = s; if (trocou) { painelSniper = ''; $('sniper-area').innerHTML = ''; } pintarSniper(); posicionar(); });
  window.hub.aoSniperPainel((html) => { painelSniper = html; if (sniper.conta != null) pintarSniper(); });

  // ---------- versão nova ----------
  window.hub.aoAtualizacao((a) => {
    const b = $('btn-versao');
    b.textContent = `⬇ Nova versão ${a.versao} do Hub: baixar`; b.title = a.notas || 'Abre a página do Hub no site';
    b.hidden = false; b.onclick = () => window.hub.baixarVersao();
  });

  // ---------- temas ----------
  function aplicarTema(t, salvar) {
    if (!NOMES_TEMA[t]) t = 'lavender';
    document.documentElement.dataset.tema = t;
    document.querySelectorAll('.tema').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
    $('tema-nome').textContent = NOMES_TEMA[t];
    if (salvar) window.hub.tema(t);
  }
  document.querySelectorAll('.tema').forEach((b) => { b.onclick = () => aplicarTema(b.dataset.t, true); });

  // ---------- teclado ----------
  const sairDoFoco = () => { if (modalAberto) fecharJanelas(); else if (foco !== null) focar(null); };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') sairDoFoco();
    if (e.ctrlKey && /^[1-4]$/.test(e.key)) { const i = Number(e.key) - 1; if (estado[i].ativo) focar(i); }
  });
  window.hub.aoEsc(sairDoFoco);
  window.hub.aoAtalho((i) => { if (estado[i].ativo) focar(i); });

  // ---------- status vindo do motor ----------
  window.hub.aoStatus((s) => {
    const ativoAntes = estado[s.i].ativo;
    Object.assign(estado[s.i], s);
    pintar(estado[s.i]);
    if (ativoAntes !== estado[s.i].ativo) posicionar();
    if (sniper.conta === s.i && !painelSniper) pintarSniper();
  });
  setInterval(() => estado.forEach(pintar), 30000); // "ligada há…"

  // teste automático (npm run teste)
  window.hub.aoTeste((acao, i) => {
    if (acao === 'adicionar') window.hub.adicionar(i);
    if (acao === 'mudo') window.hub.mudo(i);
    if (acao === 'cheia') focar(i);
    if (acao === 'esc') sairDoFoco();
    if (acao === 'tema') aplicarTema(i, true);
    if (acao === 'sniper') window.hub.sniperLigar(i);
    if (acao === 'sniper-acao') window.hub.sniperAcao({ acao: 'revenda', v: 'paciencia' });
  });

  montar();
  window.hub.inicio().then((d) => {
    d.contas.forEach((s) => Object.assign(estado[s.i], s));
    sniper = d.sniper; aplicarTema(d.cfg.tema, false);
    estado.forEach(pintar); pintarSniper(); posicionar();
  });
})();
