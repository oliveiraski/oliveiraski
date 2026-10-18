// Gera as imagens animadas do perfil (dist/firstbid.svg, dist/power.svg e dist/stats.svg).
// O GitHub não roda JS no README: o JS roda aqui, no Actions, e a animação
// fica no próprio SVG (SMIL), que o GitHub exibe.
//
// Visual: FirstBid (fundo tinta-azul, dourado só no que está ATIVO, valor faz
// SNAP e nunca tween, cadência de 2,6s) + Power Telecom (fibra verde #00E676).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const USER = process.env.GH_USER || "oliveiraski";
const TOKEN = process.env.GITHUB_TOKEN;

const C = {
  ground: "#070b14", deep: "#04070e", glow: "#ffc950", core: "#fff0c8",
  decay: "#9c7434", ghost: "#1a2334", ghostLit: "#2b3a55", bone: "#ece6d9",
  boneDim: "#93a0b6", fibra: "#00e676", fibraEsc: "#00c853",
};
const CICLO = 2.6; // a cada 2,6s "chega um pedido", como no firstbid.xyz
const f = (n) => +n.toFixed(1);
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- dados ----------
async function calendario() {
  if (!TOKEN) throw new Error("defina GITHUB_TOKEN");
  const query = `query($u:String!){user(login:$u){contributionsCollection{
    contributionCalendar{totalContributions weeks{contributionDays{contributionCount date}}}}}}`;
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { u: USER } }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  const cal = j.data.user.contributionsCollection.contributionCalendar;
  return {
    total: cal.totalContributions,
    dias: cal.weeks.flatMap((w) => w.contributionDays.map((d) => ({ n: d.contributionCount, data: d.date }))),
  };
}

function metricas({ total, dias }) {
  let maior = 0, run = 0;
  for (const d of dias) { run = d.n ? run + 1 : 0; maior = Math.max(maior, run); }
  // sequência atual: hoje ainda pode estar zerado sem quebrar a sequência
  let i = dias.length - 1, atual = 0;
  if (dias[i]?.n === 0) i--;
  while (i >= 0 && dias[i].n > 0) { atual++; i--; }
  const meses = new Map();
  for (const d of dias) { const k = d.data.slice(0, 7); meses.set(k, (meses.get(k) || 0) + d.n); }
  // só meses fechados, no horário da Bahia (o Actions roda em UTC e já "vê" o mês seguinte);
  // o mês corrente só entra no último dia, senão a linha despenca no fim.
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bahia" }));
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1);
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const ultimoDia = ym(amanha) !== ym(hoje);
  const serie = [...meses.entries()]
    .filter(([k]) => k < ym(hoje) || (ultimoDia && k === ym(hoje)))
    .slice(-12);
  const ativos = dias.filter((d) => d.n > 0).length;
  return { total, maior, atual, serie, ativos };
}

// fontes do firstbid.xyz embutidas (SVG dentro de <img> não carrega fonte externa)
async function fonte(familia, peso, texto) {
  const url = `https://fonts.googleapis.com/css2?family=${familia.replace(/ /g, "+")}:wght@${peso}&text=${encodeURIComponent(texto)}`;
  const css = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Chrome/120" } })).text();
  const src = css.match(/url\((https:[^)]+)\)/)?.[1];
  if (!src) return "";
  const b64 = Buffer.from(await (await fetch(src)).arrayBuffer()).toString("base64");
  return `@font-face{font-family:'${familia}';font-weight:${peso};src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
}

const TODAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÇÃÕÉÊÍÓÚçãõéêíóú0123456789$.,·/:-—→%+ ";
async function estilos() {
  const [disp, mono, monoB] = await Promise.all([
    fonte("Big Shoulders Display", 900, TODAS),
    fonte("Chivo Mono", 300, TODAS),
    fonte("Chivo Mono", 700, TODAS),
  ]);
  return `<style>${disp}${mono}${monoB}
    .d{font-family:'Big Shoulders Display',Impact,'Arial Narrow',sans-serif;font-weight:900}
    .m{font-family:'Chivo Mono',ui-monospace,Consolas,monospace;font-weight:300}
    .mb{font-family:'Chivo Mono',ui-monospace,Consolas,monospace;font-weight:700}
  </style>`;
}

// malha de bronze do firstbid.xyz: passo de 3px, 5,5% de alfa
const gaze = `<pattern id="gaze" width="3" height="3" patternUnits="userSpaceOnUse">
  <path d="M0,0H3M0,0V3" stroke="${C.glow}" stroke-opacity=".055" stroke-width="1"/></pattern>`;
const brilho = `<filter id="brilho" x="-100%" y="-100%" width="300%" height="300%">
  <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

// liga/desliga em degrau (SNAP) dentro do ciclo: aceso de a até b (fração)
const snap = (attr, a, b, on, off, dur, begin = 0) =>
  `<animate attributeName="${attr}" calcMode="discrete" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"
    keyTimes="0;${a};${b}" values="${off};${on};${off}"/>`;

// logo do FirstBid desenhado em vetor
function logo(x, y, s) {
  return `<g transform="translate(${x},${y}) scale(${s})">
    <path d="M0,-70 58,-30 43,60 -42,60 -57,-30Z" fill="${C.glow}" opacity=".14">
      ${snap("opacity", 0.0, 0.42, ".38", ".14", CICLO, 0.9)}
    </path>
    <g fill="none" stroke="${C.glow}" stroke-width="4" stroke-linejoin="round" filter="url(#brilho)">
      <path d="M0,-48 -35,-23 -25,48 25,48 35,-23Z M0,-48V48"/>
    </g>
    <circle cy="-48" r="6" fill="${C.core}"/>
  </g>`;
}

// ---------- utilidades de linha do tempo ----------
// troca de valor em degrau (SNAP) ao longo de um ciclo de T segundos.
// marcos: [[segundo, valor], ...]
function degraus(attr, T, marcos) {
  const m = [...marcos].sort((a, b) => a[0] - b[0]);
  if (m[0][0] !== 0) m.unshift([0, m[m.length - 1][1]]);
  return `<animate attributeName="${attr}" calcMode="discrete" dur="${T}s" repeatCount="indefinite"
    keyTimes="${m.map(([t]) => (t / T).toFixed(4)).join(";")}" values="${m.map(([, v]) => v).join(";")}"/>`;
}
// visível só entre a e b (segundos)
const janela = (T, a, b) => degraus("opacity", T, a === 0 ? [[0, 1], [b, 0]] : [[0, 0], [a, 1], [b, 0]]);

// ---------- banner FirstBid: OWNER ----------
// simula o bot: chega um pedido, o preço já existe na matriz e só acende, a oferta sai.
function firstbid(st) {
  const W = 900, H = 270, S = 3.2;
  const pedidos = [
    { jogo: "FORTNITE", modo: "DUO", de: "OURO", para: "DIAMANTE", cel: 9 },
    { jogo: "VALORANT", modo: "SOLO", de: "PRATA", para: "PLATINA", cel: 4 },
    { jogo: "ROCKET LEAGUE", modo: "DUO", de: "PLATINA", para: "CAMPEÃO", cel: 15 },
  ];
  const T = S * pedidos.length;
  const precos = [6, 8, 9, 12, 14, 15, 18, 19, 22, 24, 25, 28, 30, 32, 35, 38, 45, 55];
  const COLS = 6, X0 = 500, Y0 = 116, DX = 64, DY = 36;

  const celulas = precos.map((p, k) => {
    const x = X0 + (k % COLS) * DX, y = Y0 + Math.floor(k / COLS) * DY;
    const i = pedidos.findIndex((o) => o.cel === k);
    let anim = "";
    if (i >= 0) {
      const marcos = [[0, C.ghost], [i * S + 0.35 * S, C.glow], [(i + 1) * S, C.decay]];
      const apaga = (i + 1) * S + 0.35 * S;
      if (apaga < T) marcos.push([apaga, C.ghost]);
      anim = degraus("fill", T, marcos);
    }
    return `<text x="${x}" y="${y}" class="d" font-size="27" fill="${C.ghost}">$${p}${anim}</text>`;
  }).join("");

  const fases = pedidos.map((o, i) => {
    const a = i * S, b = (i + 1) * S;
    return `<g opacity="0">${janela(T, a, b)}
      <text x="500" y="72" class="mb" font-size="15" fill="${C.bone}" letter-spacing="1">${o.jogo} · ${o.modo} · ${o.de} → ${o.para}</text>
      <g opacity="0">${janela(T, a + 0.6 * S, b)}
        <text x="500" y="236" class="mb" font-size="14" fill="${C.glow}" letter-spacing="1.5">→ OFERTA $${precos[o.cel]} ENVIADA</text>
      </g>
    </g>`;
  }).join("");

  // o logo acende quando a oferta sai
  const acende = degraus("opacity", T, pedidos.flatMap((_, i) => [[i * S, ".12"], [i * S + 0.6 * S, ".4"]]));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${st}
  <defs>${gaze}${brilho}
    <radialGradient id="halo"><stop offset="0" stop-color="${C.glow}" stop-opacity=".2"/><stop offset="1" stop-color="${C.glow}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="14" fill="${C.ground}"/>
  <rect width="${W}" height="${H}" rx="14" fill="url(#gaze)"/>
  <circle cx="105" cy="135" r="115" fill="url(#halo)"/>
  <g transform="translate(105,138) scale(1.08)">
    <path d="M0,-70 58,-30 43,60 -42,60 -57,-30Z" fill="${C.glow}" opacity=".12">${acende}</path>
    <path d="M0,-48 -35,-23 -25,48 25,48 35,-23Z M0,-48V48" fill="none" stroke="${C.glow}" stroke-width="4" stroke-linejoin="round" filter="url(#brilho)"/>
    <circle cy="-48" r="6" fill="${C.core}"/>
  </g>
  <text x="200" y="140" class="d" font-size="88" fill="${C.bone}">OWNER</text>
  <text x="203" y="176" class="mb" font-size="14" fill="${C.glow}" letter-spacing="4">FIRSTBID</text>
  <text x="203" y="204" class="m" font-size="12" fill="${C.boneDim}">primeira oferta em segundos</text>
  <text x="203" y="222" class="m" font-size="12" fill="${C.boneDim}">na Eldorado.gg, em 14 jogos</text>
  <line x1="470" y1="34" x2="470" y2="${H - 34}" stroke="${C.ghostLit}" stroke-width="1"/>
  <text x="500" y="46" class="m" font-size="11" fill="${C.boneDim}" letter-spacing="2">NOVO PEDIDO</text>
  ${fases}
  ${celulas}
</svg>`;
}

// ---------- banner Power Telecom: DEVOPS ----------
// rede de fibra: a OLT acende, a luz desce pelos splitters e cada cliente fica online;
// embaixo, o pipeline que põe tudo no ar.
function power(st, logoB64) {
  const W = 900, H = 290, T = 7;
  const OLT = [505, 135];
  const splitters = [[625, 82], [625, 188]];
  const ys = [38, 78, 118, 152, 192, 232];
  const rotas = ys.map((y, i) => {
    const [sx, sy] = splitters[i < 3 ? 0 : 1];
    return `M${OLT[0] + 22},${OLT[1]} C${OLT[0] + 70},${OLT[1]} ${sx - 60},${sy} ${sx},${sy} C${sx + 80},${sy} 720,${y} 790,${y}`;
  });
  const saida = (i) => 0.6 + i * 0.75;
  const chegada = (i) => saida(i) + 0.9;

  const fibras = rotas.map((d, i) => `<path id="r${i}" d="${d}" fill="none" stroke="${C.fibraEsc}" stroke-opacity=".28" stroke-width="1.6"/>`).join("");
  const pulsos = rotas.map((_, i) => `<circle r="3.4" fill="${C.fibra}" filter="url(#brilho)" opacity="0">
      ${janela(T, saida(i), chegada(i))}
      <animateMotion dur="${T}s" repeatCount="indefinite" calcMode="linear"
        keyTimes="0;${(saida(i) / T).toFixed(4)};${(chegada(i) / T).toFixed(4)};1" keyPoints="0;0;1;1"><mpath href="#r${i}"/></animateMotion>
    </circle>`).join("");
  const clientes = ys.map((y, i) => `<g transform="translate(800,${y})">
      <circle r="10" fill="${C.deep}" stroke="${C.ghostLit}" stroke-width="1.5"/>
      <circle r="4" fill="${C.ghostLit}">${degraus("fill", T, [[0, C.ghostLit], [chegada(i), C.fibra]])}</circle>
      <text x="20" y="4" class="m" font-size="11" fill="${C.ghostLit}">online${degraus("fill", T, [[0, C.ghostLit], [chegada(i), C.boneDim]])}</text>
    </g>`).join("");

  const etapas = ["COMMIT", "BUILD", "TESTE", "DEPLOY", "ONLINE"];
  const pipeline = etapas.map((e, i) => {
    const x = [40, 130, 210, 292, 384][i], t = 0.15 + i * 0.35;
    const seta = i < etapas.length - 1 ? `<text x="${[110, 191, 272, 364][i]}" y="${H - 30}" class="m" font-size="11" fill="${C.ghostLit}">→</text>` : "";
    return `<text x="${x}" y="${H - 30}" class="mb" font-size="11" fill="${C.ghostLit}" letter-spacing="1">${e}${degraus("fill", T, [[0, C.ghostLit], [t, C.fibra], [T - 0.6, C.ghostLit]])}</text>${seta}`;
  }).join("");

  const leds = [-18, -6, 6, 18].map((y, k) =>
    `<circle cy="${y}" r="3" fill="${C.ghostLit}">${degraus("fill", T, [[0, C.ghostLit], [0.3 + k * 0.08, C.fibra], [T - 0.6, C.ghostLit]])}</circle>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${st}
  <defs>${brilho}
    <pattern id="malha" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0,0H3M0,0V3" stroke="${C.fibra}" stroke-opacity=".045" stroke-width="1"/></pattern>
    <radialGradient id="haloV"><stop offset="0" stop-color="${C.fibra}" stop-opacity=".16"/><stop offset="1" stop-color="${C.fibra}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="14" fill="${C.ground}"/>
  <rect width="${W}" height="${H}" rx="14" fill="url(#malha)"/>
  <ellipse cx="200" cy="80" rx="220" ry="110" fill="url(#haloV)"/>
  <image x="40" y="34" width="320" height="94" href="data:image/png;base64,${logoB64}"/>
  <rect x="100" y="33" width="21" height="56" rx="9" fill="${C.fibra}" opacity="0" filter="url(#brilho)">
    ${degraus("opacity", T, [[0, 0], [0.3, ".55"], [0.6, 0]])}
  </rect>
  <text x="38" y="216" class="d" font-size="96" fill="${C.bone}">DEVOPS</text>
  <text x="41" y="${H - 58}" class="m" font-size="12" fill="${C.boneDim}">infraestrutura de internet por fibra óptica</text>
  ${pipeline}
  <line x1="470" y1="34" x2="470" y2="${H - 34}" stroke="${C.ghostLit}" stroke-width="1"/>
  ${fibras}
  <g transform="translate(${OLT[0]},${OLT[1]})">
    <rect x="-22" y="-34" width="44" height="68" rx="8" fill="${C.deep}" stroke="${C.fibraEsc}" stroke-width="1.5"/>
    ${leds}
    <text y="54" text-anchor="middle" class="mb" font-size="10" fill="${C.boneDim}" letter-spacing="2">OLT</text>
  </g>
  ${splitters.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${C.deep}" stroke="${C.fibra}" stroke-width="1.5"/>`).join("")}
  <text x="625" y="${H - 16}" text-anchor="middle" class="m" font-size="10" fill="${C.boneDim}" letter-spacing="2">SPLITTER</text>
  ${pulsos}
  ${clientes}
</svg>`;
}

// ---------- telemetria (substitui os cartões de estatística) ----------
function stats(st, m) {
  const W = 900, H = 230;
  const GX = 530, GY = 60, GW = 340, GH = 120;
  const max = Math.max(1, ...m.serie.map(([, n]) => n));
  const pts = m.serie.map(([, n], i) => [GX + (i / (m.serie.length - 1)) * GW, GY + GH - (n / max) * GH]);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2;
    d += ` C${f(cx)},${f(y0)} ${f(cx)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  const iMax = m.serie.findIndex(([, n]) => n === max);
  const [mx, my] = pts[iMax];
  const nomesMes = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const rotulos = m.serie.map(([k], i) => i % 2 === 0 || i === m.serie.length - 1
    ? `<text x="${f(pts[i][0])}" y="${GY + GH + 22}" text-anchor="middle">${nomesMes[+k.slice(5) - 1]}</text>` : "").join("");
  const comp = 1400;

  const num = (x, valor, rotulo, cor) => `
    <text x="${x}" y="120" class="d" font-size="64" fill="${cor}">${valor}</text>
    <text x="${x + 2}" y="146" class="m" font-size="11" fill="${C.boneDim}" letter-spacing="1.5">${rotulo}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${st}
  <defs>${gaze}${brilho}
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.fibra}" stop-opacity=".22"/><stop offset="1" stop-color="${C.fibra}" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="14" fill="${C.ground}"/>
  <rect width="${W}" height="${H}" rx="14" fill="url(#gaze)"/>
  <text x="30" y="40" class="mb" font-size="12" fill="${C.boneDim}" letter-spacing="2.5">TELEMETRIA · ÚLTIMOS 12 MESES</text>
  ${num(30, m.total.toLocaleString("pt-BR"), "CONTRIBUIÇÕES", C.bone)}
  ${num(200, m.atual, "DIAS SEGUIDOS", C.glow)}
  ${num(345, m.maior, "RECORDE", C.bone)}
  <text x="30" y="${H - 34}" class="m" font-size="11" fill="${C.boneDim}">${m.ativos} dias com commit no ano · gerado a cada 12h pelo Actions</text>
  <path d="${d} L${GX + GW},${GY + GH} L${GX},${GY + GH}Z" fill="url(#area)"/>
  <path d="${d}" fill="none" stroke="${C.fibra}" stroke-width="2.2" filter="url(#brilho)"
    stroke-dasharray="${comp}" stroke-dashoffset="${comp}">
    <animate attributeName="stroke-dashoffset" values="${comp};0;0" keyTimes="0;.35;1" dur="9s" repeatCount="indefinite" calcMode="spline" keySplines=".16 1 .3 1;0 0 1 1"/>
  </path>
  <circle cx="${f(mx)}" cy="${f(my)}" r="5" fill="${C.glow}" filter="url(#brilho)">
    ${snap("opacity", 0.35, 0.999, "1", "0", 9)}
  </circle>
  <text x="${f(mx)}" y="${f(my - 14)}" text-anchor="middle" class="mb" font-size="11" fill="${C.glow}">${max}
    ${snap("opacity", 0.35, 0.999, "1", "0", 9)}</text>
  <g class="m" font-size="10" fill="${C.boneDim}">${rotulos}</g>
</svg>`;
}

const cal = await calendario();
const m = metricas(cal);
const st = await estilos();
mkdirSync("dist", { recursive: true });
writeFileSync("dist/firstbid.svg", firstbid(st));
writeFileSync("dist/power.svg", power(st, readFileSync("assets/power-logo.png").toString("base64")));
writeFileSync("dist/stats.svg", stats(st, m));
console.log(`gerado: ${m.total} contribuições, sequência ${m.atual}, maior ${m.maior}`);
