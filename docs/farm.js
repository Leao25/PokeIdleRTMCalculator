/**
 * O simulador do "Onde farmar" do RMT Calculator (banco do PokeIdle), usado pelo site e pelo IdleDeck: o MESMO
 * código nos dois. Mexeu aqui, mudou nos dois (no IdleDeck, na próxima versão do programa, que leva uma cópia).
 *
 *   const F = criarFarm(REGRAS)   // REGRAS: as regras do jogo (dados/regras.json aplicado; lidas na hora da conta)
 *   F.abatesPorHora(voce, alvo, tipos, tAndar) · F.huntsPorXp({ voce, especies, nivelTreinador, bonusXp })
 *
 * voce = { tipos: ['PSYCHIC'], base: [6 stats], L, ivs: [6], q, pot, shiny, golpes (da especies.json),
 *          atuais: [6 stats de agora] | null, tm: tipo | null, aoe: bool }
 */
function criarFarm(REGRAS) {
  const TAB = { // linha = golpe; da wiki ("A tabela completa"), só o que não é ×1, fora a diagonal
    NORMAL: { ROCK: .5, GHOST: 0, STEEL: .5 },
    FIRE: { WATER: .5, GRASS: 2, ICE: 2, BUG: 2, ROCK: .5, DRAGON: .5, STEEL: 2 },
    WATER: { FIRE: 2, GRASS: .5, GROUND: 2, ROCK: 2, DRAGON: .5 },
    GRASS: { FIRE: .5, WATER: 2, POISON: .5, GROUND: 2, FLYING: .5, BUG: .5, ROCK: 2, DRAGON: .5, STEEL: .5 },
    ELECTRIC: { WATER: 2, GRASS: .5, GROUND: 0, FLYING: 2, DRAGON: .5 },
    ICE: { FIRE: .5, WATER: .5, GRASS: 2, GROUND: 2, FLYING: 2, DRAGON: 2, STEEL: .5 },
    FIGHTING: { NORMAL: 2, ICE: 2, POISON: .5, FLYING: .5, PSYCHIC: .5, BUG: .5, ROCK: 2, GHOST: 0, DARK: 2, STEEL: 2, FAIRY: .5 },
    POISON: { GRASS: 2, GROUND: .5, ROCK: .5, GHOST: .5, STEEL: 0, FAIRY: 2 },
    GROUND: { FIRE: 2, GRASS: .5, ELECTRIC: 2, POISON: 2, FLYING: 0, BUG: .5, ROCK: 2, STEEL: 2 },
    FLYING: { GRASS: 2, ELECTRIC: .5, FIGHTING: 2, BUG: 2, ROCK: .5, STEEL: .5 },
    PSYCHIC: { FIGHTING: 2, POISON: 2, DARK: 0, STEEL: .5 },
    BUG: { FIRE: .5, GRASS: 2, FIGHTING: .5, POISON: .5, FLYING: .5, PSYCHIC: 2, GHOST: .5, DARK: 2, STEEL: .5, FAIRY: .5 },
    ROCK: { FIRE: 2, ICE: 2, FIGHTING: .5, GROUND: .5, FLYING: 2, BUG: 2, STEEL: .5 },
    GHOST: { NORMAL: 0, PSYCHIC: 2, DARK: .5 },
    DRAGON: { STEEL: .5, FAIRY: 0 },
    DARK: { FIGHTING: .5, PSYCHIC: 2, GHOST: 2, FAIRY: .5 },
    STEEL: { FIRE: .5, WATER: .5, ELECTRIC: .5, ICE: 2, ROCK: 2, FAIRY: 2 },
    FAIRY: { FIRE: .5, FIGHTING: 2, POISON: .5, DRAGON: 2, DARK: 2, STEEL: .5 },
  };
  function mult1(a, d) {
    if (a === d) { const c = TAB[a]?.[d]; if (c != null) return c; if (a === 'GHOST' || a === 'DRAGON') return 2; if (a === 'NORMAL' || a === 'GROUND' || a === 'FLYING') return 1; return .5; }
    return TAB[a]?.[d] ?? 1;
  }
  // na hunt a vantagem é ampliada (×1,5 hoje): ×2 vira ×2,5, ×4 vira ×5,5, ×0,5 vira ×0,333 (wiki)
  const NA_HUNT = (m) => m === 0 ? 0 : m === 1 ? 1 : m > 1 ? 1 + (m - 1) * REGRAS.ampliacaoHunt : m / REGRAS.ampliacaoHunt;
  const efet = (a, d1, d2) => NA_HUNT(mult1(a, d1) * (d2 && d2 !== d1 ? mult1(a, d2) : 1));
  const BONUS_POT = REGRAS.bonusPot;
  const EXPO = { hp: .95, atk: .8, def: .8, spAtk: .8, spDef: .8, speed: .95 };
  // s por abate quando se mata com 1 golpe (andar + golpe + bola): medido 15/10, Blastoise Nv 203 na
  // Magikarp Nv 1 a noite inteira, 8.211 abates em 7h15 = 3,18 s (o Hunt Analyser do jogo supõe 3,66 s)
  const T_ANDAR = 3.18;
  // s de luta para os próximos selvagens chegarem e ficarem colados (hipótese: ~10 passos a 0,29 s)
  const APROX = 3;
  function stats(base, L, ivs, q, mult) {
    const k = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];
    return Object.fromEntries(k.map((s, i) => [s, (base[i] + 2 * ivs[i]) * (L / 100) * Math.pow(q, EXPO[s]) * mult]));
  }
  function dano(L, power, A, D, stab, ef) { return ((((2 * L / 5 + 2) * power * A / D) / 50) + 2) * stab * ef * 0.925; }
  // Simula SIM_S segundos de hunt: anda até o alvo, ataca com o golpe pronto de mais dano (ou a
  // Investida a cada 2 s se nenhum estiver pronto; 0,9 s entre ataques), sobra de dano se perde.
  const SIM_S = 900;
  // HP do selvagem = HP de combate (stat × 12) × o multiplicador do jogo (×5 hoje) = ×60 — regra da
  // wiki, sem calibrar. Conferido 15/10: Alakazam no Gulpin Nv 500 −7% e na Toxic Toxicroak −4%.
  const hpMult = () => 12 * REGRAS.multHpSelvagem;
  // Cada selvagem nasce com IV e qualidade próprios: o HP medido na Toxic Toxicroak foi de 7,7K a 13,3K
  // (média 10,1K). Com HP fixo o simulador errava quem morre num golpe só; aqui ele gira esta escada.
  const HP_VAR = [0.78, 0.88, 0.96, 1.04, 1.12, 1.24];
  function abatesPorHora(voce, alvo, tipos, tAndar = T_ANDAR) {
    const me = voce.atuais ? Object.fromEntries(['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'].map((k, i) => [k, voce.atuais[i]]))
      : stats(voce.base, voce.L, voce.ivs, voce.q, (1 + BONUS_POT[voce.pot - 1]) * (voce.shiny ? 3 : 1));
    const tw = [tipos[alvo.t1], alvo.t2 >= 0 ? tipos[alvo.t2] : null];
    const ele = stats(alvo.base, alvo.L, [16.5, 16.5, 16.5, 16.5, 16.5, 16.5], 1, 1);
    const hp = ele.hp * hpMult();
    const golpes = [];
    let melhorEf = 0;
    for (const [pw, cd, fis, ti, nv] of voce.golpes) {
      if (nv > voce.L || !cd) continue;
      const tipo = tipos[ti], ef = efet(tipo, tw[0], tw[1]);
      const stab = voce.tipos.includes(tipo) ? 1.5 : 1;
      golpes.push({ d: dano(voce.L, pw, fis ? me.atk : me.spAtk, fis ? ele.def : ele.spDef, stab, ef), cd, pronto: 0 });
      melhorEf = Math.max(melhorEf, ef);
    }
    // TM Elemental (wiki): golpe especial novo, power 2.800, recarga 60 s, tipo de um dos tipos do pokémon;
    // acerta o alvo e quem estiver colado nele (3×3: até 3 quando o alvo está na diagonal, o caso comum)
    if (voce.tm) {
      const ef = efet(voce.tm, tw[0], tw[1]);
      golpes.push({ d: dano(voce.L, 2800, me.spAtk, ele.spDef, voce.tipos.includes(voce.tm) ? 1.5 : 1, ef), cd: 60, pronto: 0, tm: true });
      melhorEf = Math.max(melhorEf, ef);
    }
    golpes.sort((a, b) => b.d - a.d);
    // Speed (wiki): a recarga dos golpes cai até 7% (Speed base da espécie × IV de SPD ÷ 32), e o IV de
    // SPD tira 10 ms por ponto do intervalo entre ataques (0,9 s) e da Investida (2 s).
    const ivSpd = voce.ivs[5] ?? 16.5, spdBase = voce.base[5] ?? 0;
    const potencialSpd = Math.min(7, spdBase <= 120 ? spdBase / 20 : 6 + (spdBase - 120) / 40);
    for (const g of golpes) g.cd *= 1 - potencialSpd * ivSpd / 32 / 100;
    const INTERVALO = Math.max(0.4, 0.9 - 0.01 * ivSpd), T_INVESTIDA = Math.max(0.4, 2 - 0.01 * ivSpd);
    let tb = voce.tipos[0]; if (efet(tb, tw[0], tw[1]) === 0 && voce.tipos[1]) tb = voce.tipos[1];
    const basico = dano(voce.L, 30, me.atk, ele.def, 1.5, efet(tb, tw[0], tw[1]));
    if (!(basico > 0) && !golpes.some((g) => g.d > 0)) return { porHora: 0, hp, melhorEf };
    // O que você toma. Medido 15/10 na aba do jogo (mensagens de batalha): CADA selvagem novo entra com
    // todos os golpes carregados e solta um por vez, do mais forte para o mais fraco (Gulpin: Toxic
    // Deluge 600 → Gunk Shot → Poison Jab…), a cada ~1,5 s (mínimo 1,4 s da wiki); recarregando tudo,
    // vem a Investida (2 s). Quem morre no seu primeiro golpe não revida (Toxic Toxicroak: o selvagem
    // bateu em 24 de 84 lutas). ×1,8 no dano e a vantagem de tipo da hunt nos dois sentidos. Só um
    // selvagem bate por vez. Seu HP de combate = HP × 12, como na ficha.
    const hpVoce = me.hp * 12;
    const mt = voce.tipos;
    const golpesEle = [];
    for (const [pw, cd, fis, ti, nv] of alvo.golpes) {
      if (nv > alvo.L || !cd) continue;
      const tipo = tipos[ti];
      const stab = tw.includes(tipo) ? 1.5 : 1;
      golpesEle.push({ d: dano(alvo.L, pw, fis ? ele.atk : ele.spAtk, fis ? me.def : me.spDef, stab, efet(tipo, mt[0], mt[1])) * REGRAS.multDanoSelvagem, cd, pronto: 0 });
    }
    // golpe em que você é imune (dano 0) nunca sai: fora da lista (com ele, o relógio voltava a 0 e travava a aba)
    for (let i = golpesEle.length - 1; i >= 0; i--) if (!(golpesEle[i].d > 0)) golpesEle.splice(i, 1);
    golpesEle.sort((a, b) => b.d - a.d);
    let tbe = tw[0]; if (efet(tbe, mt[0], mt[1]) === 0 && tw[1]) tbe = tw[1];
    const investidaEle = dano(alvo.L, 30, ele.atk, me.def, 1.5, efet(tbe, mt[0], mt[1])) * REGRAS.multDanoSelvagem;
    // a sequência de golpes de um selvagem novo: acum[k] = dano somado dos k+1 primeiros, um a cada 1,5 s
    const INTERVALO_ELE = 1.5; // medido: 1,54 s entre golpes do Gulpin (wiki: mínimo 1,4)
    const acum = [];
    for (let t = 0, proxInv = 0, soma = 0, voltas = 0; t < SIM_S && acum.length < 400 && voltas++ < 5000;) {
      const g = golpesEle.find((x) => x.pronto <= t && x.d > 0);
      if (g) { soma += g.d; g.pronto = t + g.cd; acum.push(soma); t += INTERVALO_ELE; }
      else if (t >= proxInv) { soma += investidaEle; proxInv = t + 2; acum.push(soma); t += INTERVALO_ELE; }
      else t = Math.max(t + 0.01, Math.min(proxInv, ...golpesEle.map((x) => x.pronto)));
    }
    const danoNaLuta = (dur) => (acum.length ? acum[Math.min(acum.length - 1, Math.floor(dur / INTERVALO_ELE))] : 0);

    const golpesHist = {};
    let t = 0, abates = 0, vida = hp * HP_VAR[0], proxBasico = 0, inicioLuta = -1, golpesNaLuta = 0, danoTomado = 0;
    // Em área (TM Elemental 3×3, disco AoE 11×11): o dano também cai em quem está esperando em volta.
    // "cercando" = quantos selvagens já chegaram e esperam (até 8 em volta, como no jogo); "pre" guarda
    // o dano que cada um deles já levou antes da vez dele. Sem medição ainda: regra da wiki.
    let cercando = 0, tUlt = t; const pre = [];
    const golpeEmArea = (d, tm) => {
      const k = Math.min(Math.floor(cercando), tm ? 2 : voce.aoe ? 8 : 0);
      for (let i = 0; i < k; i++) pre[i] = (pre[i] || 0) + d;
    };
    t += tAndar;
    let voltasSim = 0;
    while (t < SIM_S && voltasSim++ < 200000) {
      const g = golpes.find((x) => x.pronto <= t && x.d > 0);
      let d;
      if (g) { d = g.d; g.pronto = t + g.cd; }
      else if (t >= proxBasico) { d = basico; proxBasico = t + T_INVESTIDA; }
      else { const prox = Math.min(proxBasico, ...golpes.filter((x) => x.d > 0).map((x) => x.pronto)); t = Math.max(t + 0.01, prox); continue; }
      if (inicioLuta < 0) inicioLuta = t;
      cercando = Math.min(8, cercando + 8 * (t - tUlt) / APROX); tUlt = t;
      golpesNaLuta++;
      vida -= d;
      if (g?.tm || voce.aoe) golpeEmArea(d, !!g?.tm);
      if (vida <= 0) {
        const dur = t - inicioLuta;
        if (golpesNaLuta > 1) danoTomado += danoNaLuta(dur);
        golpesHist[golpesNaLuta] = (golpesHist[golpesNaLuta] || 0) + 1;
        // Enquanto a luta dura, os outros selvagens vêm e ficam em volta esperando a vez (visto no
        // jogo): numa luta longa o próximo já está colado. Caminhada cheia no abate de 1 golpe, e
        // ~0,3 s (um passo) a partir de APROX s de luta.
        abates++; vida = hp * HP_VAR[abates % HP_VAR.length] - (pre.shift() || 0); cercando = Math.max(0, cercando - 1);
        // quem já morreu pela área enquanto esperava conta como abate, sem luta
        while (vida <= 0 && abates < 1e5) { abates++; golpesHist[0] = (golpesHist[0] || 0) + 1; cercando = Math.max(0, cercando - 1); vida = hp * HP_VAR[abates % HP_VAR.length] - (pre.shift() || 0); }
        t += Math.max(0.3, tAndar * Math.max(0, 1 - dur / APROX)); tUlt = t; inicioLuta = -1; golpesNaLuta = 0;
      } else t += INTERVALO;
    }
    const danoPorAbate = abates ? danoTomado / abates : danoNaLuta(SIM_S);
    const lutas = !abates ? 0 : danoPorAbate > 0 ? hpVoce / danoPorAbate : Infinity;
    const porHora = abates * 3600 / SIM_S;
    // não há cura natural na hunt (só ao subir de nível): perder mais de uma barra de HP por hora já
    // é gasto de poção de verdade
    const risco = lutas < 1.5 ? "morre" : danoPorAbate * porHora > hpVoce ? "pocao" : "seguro";
    // golpes por luta de verdade (fora quem morreu pela área esperando a vez)
    const lutasReais = Object.entries(golpesHist).filter(([k]) => +k > 0), nLutas = lutasReais.reduce((a, [, v]) => a + v, 0);
    const golpesPorAbate = nLutas ? lutasReais.reduce((a, [k, v]) => a + k * v, 0) / nLutas : 0;
    return { porHora, hp, melhorEf, hpVoce, danoPorAbate, lutas, risco, hpPerdidoH: danoPorAbate * porHora, golpesHist, golpesPorAbate };
  }
  function chanceCaptura(npc, bola = 4) {
    const c = REGRAS.captura;
    const r = Math.log10(Math.max(100, npc)) - 1, fator = 1 + r ** 3 / c.raridadeDiv;
    return Math.min(c.teto, Math.max(c.piso, c.base * (bola / fator) * 1.4));
  }

  /** XP de um abate: só o nível da hunt importa (shared/sell-value.mjs do jogo). */
  const xpPorAbate = (n) => n <= 150 ? Math.floor((6 * n * n) / 10) + 8 : Math.round(13500 * (n / 150) ** 1.25);
  /** Ouro-base de um abate (mesma fonte), com o teto do Nv 25.000. */
  const ouroBaseAbate = (n) => Math.min(15776, Math.max(1, Math.round(36 * Math.max(1, n) ** 0.6006668740248916)));
  /**
   * Ouro de um abate desde 16/10/2026 (shared/recompensa-hunt.mjs): o jogo tirou o loot vendido ao NPC e paga o
   * valor dele como BÔNUS DE LOOT: renda-alvo = 1,15 × ouro-base até o Nv 25.000 (acima, 1,15 × 15.776 ×
   * (n/25.000)^0,30), bônus = alvo − base, multiplicado pelo Loot Boost (+40%). Bate com o medido no Gulpin
   * Nv 500 em 15/10 (1.688/abate, com a venda automática de drops antiga; a conta dá 1.731).
   */
  function ouroPorAbate(n, lootPct = 0) {
    const base = ouroBaseAbate(n), m = Math.max(1, n);
    const alvo = Math.round((m <= 25000 ? base : 15776 * (m / 25000) ** 0.3) * 1.15);
    return base + Math.round(Math.max(0, alvo - base) * (1 + lootPct / 100));
  }
  /** Quantos níveis o pokémon sobe em uma hora ganhando xpH, a partir do nível L (o custo cresce a cada nível). */
  function niveisPorHora(L, xpH) {
    let n = Math.floor(L), resta = xpH, frac = L - n, niveis = 0;
    for (let i = 0; i < 1000 && resta > 0; i++) {
      const custo = (xpTotal(n + 1) - xpTotal(n)) * (1 - frac);
      if (resta >= custo) { resta -= custo; niveis += 1 - frac; n++; frac = 0; } else { niveis += resta / (xpTotal(n + 1) - xpTotal(n)); resta = 0; }
    }
    return niveis;
  }
  /** XP total para chegar ao nível L (wiki, "A curva"). */
  const xpTotal = (L) => Math.round(50 / 3 * (L ** 3 - 6 * L ** 2 + 17 * L - 12));
  /** Caminhada por abate na Outland. Medida 15/10 numa sessão de 2h41 no painel do jogo (Alakazam P4 Nv 555
   * na Toxic Toxicroak da Outland 2: 4.034 abates = 1.504/h; ouro 730/abate igual à fórmula): 2,2 s fecha
   * abates (1.496/h), golpes por abate (1,39 contra 1,40 na escuta) e quase todo o gasto de poção. As
   * escutas de 2–3 min davam 1,6 s porque pegam o começo da onda, com os selvagens juntos.
   * A caminhada muda de mapa para mapa (Magikarp Nv 1 de Kanto: ~3,2 s, 7h15 de sessão). */
  const T_ANDAR_OUTLAND = 2.2;

  /**
   * As melhores hunts para XP de um pokémon (o modo "Mais XP" do site): todas as hunts com espécie de hunt até o
   * nível do treinador (fora as megas), ordenadas por XP/h. especies = { tipos, lista: [{ nome, dex, t1, t2, base,
   * L, npc, golpes }] } (dados/especies.json). bonusXp = o multiplicador do pokémon (1 = sem bônus).
   * Devolve { lista, top, quase, tranquila }: quase = outra dentro de 10% da melhor; tranquila = a melhor sem
   * poção (ou com bem menos poção) quando a melhor gasta poção.
   */
  function huntsPorXp({ voce, especies, nivelTreinador, bonusXp = 1, lootPct = 0, mostrarMortes = false }) {
    const alvos = especies.lista.filter((e) => e.L > 0 && !/^mega\s/i.test(e.nome) && (!(nivelTreinador > 0) || e.L <= nivelTreinador));
    const lista = alvos.map((e) => {
      const outland = e.dex >= 2000;
      const r = abatesPorHora(voce, e, especies.tipos, outland ? T_ANDAR_OUTLAND : T_ANDAR);
      const xpH = r.porHora * xpPorAbate(e.L) * bonusXp;
      return { e, outland, risco: r.risco, lutas: r.lutas, hpPerdidoH: r.hpPerdidoH, gp: r.golpesPorAbate, abates: r.porHora, ef: r.melhorEf,
        xpH, ouroH: r.porHora * ouroPorAbate(e.L, lootPct), niveisH: niveisPorHora(voce.L, xpH) };
    }).filter((x) => x.abates > 0 && (mostrarMortes || x.risco !== 'morre')).sort((a, b) => b.xpH - a.xpH);
    const top = lista[0] || null;
    const quase = top ? lista.slice(1).find((x) => x.xpH >= top.xpH * 0.9) || null : null;
    const tranquila = top && top.risco === 'pocao' ? lista.find((x) => x.risco === 'seguro' || (x.risco === 'pocao' && x.hpPerdidoH < top.hpPerdidoH / 3)) || null : null;
    return { lista, top, quase, tranquila };
  }

  return { TAB, mult1, efet, stats, dano, abatesPorHora, chanceCaptura, xpPorAbate, ouroBaseAbate, ouroPorAbate, niveisPorHora, xpTotal,
    T_ANDAR, T_ANDAR_OUTLAND, huntsPorXp };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { criarFarm };
