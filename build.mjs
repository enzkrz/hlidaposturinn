// Hlíðapósturinn: static site generator. No dependencies. Run: node build.mjs
// Reads data/events.csv and data/thjonusta.csv, writes the site to public/.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "public");
const site = JSON.parse(readFileSync(join(ROOT, "site.json"), "utf8"));

// ---------- helpers ----------
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Minimal CSV reader. Handles quotes, BOM, CRLF, and , ; or tab as delimiter
// (Icelandic Excel saves CSV with semicolons). Lines starting with # are comments.
function readCsv(file) {
  let text = readFileSync(file, "utf8").replace(/^﻿/, "");
  text = text.split(/\r?\n/).filter((l) => !l.trim().startsWith("#")).join("\n");
  const first = text.split("\n")[0] || "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of first) if (ch in counts) counts[ch]++;
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ""));
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

// Dates are handled as "YYYY-MM-DD" strings and UTC day numbers (Iceland is UTC+0 all year).
function parseDate(s) {
  s = (s || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  return null;
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const toDay = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
const fromDay = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

const TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10);
const todayN = toDay(TODAY);

const WD = ["SUN", "MÁN", "ÞRI", "MIÐ", "FIM", "FÖS", "LAU"];
const MON = ["jan.", "feb.", "mar.", "apr.", "maí", "jún.", "júl.", "ágú.", "sep.", "okt.", "nóv.", "des."];
const MONTH_NAMES = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
const dow = (n) => new Date(n * 86400000).getUTCDay(); // 0 = Sunday
const mondayOf = (n) => n - ((dow(n) + 6) % 7);

// Icelandic public holidays (almennir frídagar), including the afternoon-off days
// that people treat as holidays: Aðfangadagur and Gamlársdagur.
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return toDay(iso(y, month, day));
}
const holidayCache = new Map();
function holidays(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const e = easter(y), set = new Set();
  const add = (n) => set.add(fromDay(n));
  add(toDay(iso(y, 1, 1)));
  [-3, -2, 0, 1, 39, 49, 50].forEach((o) => add(e + o)); // skírdagur … annar í hvítasunnu
  add(toDay(iso(y, 4, 19)) + ((4 - dow(toDay(iso(y, 4, 19))) + 7) % 7)); // sumardagurinn fyrsti
  add(toDay(iso(y, 5, 1)));
  add(toDay(iso(y, 6, 17)));
  const aug1 = toDay(iso(y, 8, 1));
  add(aug1 + ((1 - dow(aug1) + 7) % 7)); // frídagur verslunarmanna
  [24, 25, 26, 31].forEach((d) => add(toDay(iso(y, 12, d))));
  holidayCache.set(y, set);
  return set;
}
const isHoliday = (s) => holidays(+s.slice(0, 4)).has(s);

const slug = (s) =>
  s.toLowerCase().replace(/ð/g, "d").replace(/þ/g, "th").replace(/æ/g, "ae").replace(/ö/g, "o")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- data ----------
const events = readCsv(join(ROOT, "data/events.csv"))
  .map((r) => {
    const date = parseDate(r.dagsetning);
    if (!date) {
      console.warn(`Sleppi línu án gildrar dagsetningar: "${r.titill}" (${r.dagsetning})`);
      return null;
    }
    const end = parseDate(r.lykur) || date;
    return { date, end: end < date ? date : end, time: r.klukkan, title: r.titill, place: r.stadur,
      tag: r.flokkur, desc: r.lysing, link: r.hlekkur };
  })
  .filter((e) => e && e.title);

const upcoming = events.filter((e) => toDay(e.end) >= todayN);
const past = events.filter((e) => toDay(e.end) < todayN);

// Effective day for ordering: an ongoing course counts as today.
const eff = (e) => Math.max(toDay(e.date), todayN);
upcoming.sort((a, b) => eff(a) - eff(b) || a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
past.sort((a, b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time));

// ---------- templates ----------
const fmtLong = (s) => `${+s.slice(8, 10)}. ${MON[+s.slice(5, 7) - 1]}`;
const clock = (t) => (/^\d/.test(t) ? `kl. ${t}` : t);

function card(e, { muted = false, week = "", helgin = false } = {}) {
  const n = toDay(e.date);
  const weekend = [0, 6].includes(dow(n)) || isHoliday(e.date);
  const when = [clock(e.time), e.end !== e.date ? `til ${fmtLong(e.end)}` : ""].filter(Boolean).join(" · ");
  const tagCls = slug(e.tag) === "opnun" ? " tag-opnun" : "";
  return `
    <article class="card${muted ? " is-past" : ""}" data-week="${week}"${helgin ? ' data-helgin="1"' : ""}>
      <div class="tile${weekend ? " is-weekend" : ""}" aria-label="${esc(WD[dow(n)])} ${+e.date.slice(8, 10)}. ${esc(MON[+e.date.slice(5, 7) - 1])}">
        <span class="wd">${WD[dow(n)]}</span><span class="d">${+e.date.slice(8, 10)}</span><span class="m">${MON[+e.date.slice(5, 7) - 1]}</span>
      </div>
      <div class="body">
        ${e.tag ? `<span class="tag${tagCls}"><i></i>${esc(e.tag)}</span>` : ""}
        <h3>${esc(e.title)}</h3>
        ${e.desc ? `<p>${esc(e.desc)}</p>` : ""}
        ${e.place || when ? `<dl class="facts">${e.place ? `<div><dt>Hvar</dt><dd>${esc(e.place)}</dd></div>` : ""}${when ? `<div><dt>Hvenær</dt><dd>${esc(when)}</dd></div>` : ""}</dl>` : ""}
      </div>
      ${e.link ? `<a class="btn" href="${esc(e.link)}" rel="noopener">Nánar <span aria-hidden="true">→</span></a>` : ""}
    </article>`;
}

const NAV = [
  ["index", "Í vikunni", ""],
  ["thjonusta", "Þjónusta", "thjonusta/"],
  ["lidnir", "Liðnir viðburðir", "lidnir/"],
  ["um", "Um", "um/"],
];

function layout({ page, title, root, hero, main }) {
  const nav = NAV.map(([id, label, href]) =>
    `<a href="${root}${href}"${id === page ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const fullTitle = page === "index" ? site.name : `${title} · ${site.name}`;
  return `<!doctype html>
<html lang="is">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(site.description)}">
  ${site.noindex ? '<meta name="robots" content="noindex, nofollow">' : ""}
  <link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
  <link rel="preload" href="${root}fonts/outfit-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${root}style.css">
</head>
<body>
  <a class="skip" href="#efni">Fara beint í efnið</a>
  <header class="top">
    <a class="wordmark" href="${root || "./"}">${esc(site.name)}</a>
    <nav aria-label="Aðalvalmynd">${nav}</nav>
  </header>
  ${hero}
  <main id="efni">
${main}
  </main>
  <footer class="foot">
    <div>${esc(site.name)} — vikuleg samantekt fyrir hverfið.</div>
    <div class="foot-links">
      <a href="${root}lidnir/">Eldra efni</a>
      <a href="${root}um/">Um síðuna</a>
      <a href="mailto:${esc(site.tipEmail)}">Senda ábendingu</a>
    </div>
  </footer>
${page === "index" ? `  <script src="${root}site.js" defer></script>` : ""}
</body>
</html>
`;
}

const pageHero = (title, intro) => `
  <section class="hero hero-small">
    <h1>${esc(title)}</h1>
    <p class="intro">${esc(intro)}</p>
  </section>`;

const tipCard = `
    <div class="tip">
      <div>
        <strong>Veistu um eitthvað á döfinni í hverfinu?</strong>
        <p>Sendu okkur línu og við skoðum hvort það rati á listann.</p>
      </div>
      <a class="btn btn-outline" href="mailto:${esc(site.tipEmail)}">Senda ábendingu</a>
    </div>`;

// ---------- pages ----------
const pages = {};

// Index: upcoming events, grouped by week.
{
  const thisMon = mondayOf(todayN);
  const groups = { this: [], next: [], later: [] };
  for (const e of upcoming) {
    const w = Math.floor((mondayOf(eff(e)) - thisMon) / 7);
    (w <= 0 ? groups.this : w === 1 ? groups.next : groups.later).push(e);
  }
  const heading = { this: "Þessi vika", next: "Næsta vika", later: "Síðar" };
  const horizon = todayN + 7;
  const sections = Object.entries(groups)
    .filter(([, list]) => list.length)
    .map(([k, list]) => `
    <section class="group" data-group="${k}">
      <h2 class="week">${heading[k]}</h2>
${list.map((e) => card(e, { week: k, helgin: [0, 6].includes(dow(toDay(e.date))) && toDay(e.date) >= todayN && toDay(e.date) < horizon })).join("\n")}
    </section>`).join("\n");

  const hero = `
  <section class="hero">
    <span class="pill">Hlíðar · Reykjavík</span>
    <h1>${esc(site.name)}</h1>
    <p class="intro">Viðburðir, nýir staðir og annað markvert í hverfinu, tekið saman einu sinni í viku.</p>
${site.signupAction ? `
    <form class="signup" action="${esc(site.signupAction)}" method="post">
      <label for="netfang" class="sr">Netfang</label>
      <input id="netfang" name="email" type="email" placeholder="netfang@example.is" autocomplete="email" required>
      <button type="submit">Skrá mig</button>
    </form>
    <p class="helper" id="signup-status" role="status">Einn póstur í viku. Ekkert rusl.</p>` : ""}
  </section>`;

  const main = `
  <div class="wrap">
    <div class="filters" role="group" aria-label="Sía viðburði" hidden>
      <button type="button" class="chip is-on" data-filter="all">Allt</button>
      <button type="button" class="chip" data-filter="this">Þessi vika</button>
      <button type="button" class="chip" data-filter="helgin">Helgin</button>
    </div>
${sections || '    <p class="empty">Engir viðburðir á dagskrá núna. Veistu um eitthvað? Sendu okkur línu.</p>'}
${tipCard}
  </div>`;
  pages.index = layout({ page: "index", title: site.name, root: "", hero, main });
}

// Archive: past events, newest first, grouped by month.
{
  let cur = "", html = "";
  for (const e of past) {
    const key = e.date.slice(0, 7);
    if (key !== cur) {
      if (cur) html += "    </section>\n";
      cur = key;
      html += `    <section class="group">\n      <h2 class="week">${MONTH_NAMES[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}</h2>\n`;
    }
    html += card(e, { muted: true }) + "\n";
  }
  if (cur) html += "    </section>\n";
  const main = `
  <div class="wrap">
${html || '    <p class="empty">Ekkert hér ennþá. Viðburðir færast hingað sjálfkrafa þegar þeir eru liðnir.</p>'}
  </div>`;
  pages.lidnir = layout({ page: "lidnir", title: "Liðnir viðburðir", root: "../",
    hero: pageHero("Liðnir viðburðir", "Það sem var á dagskrá í hverfinu. Nýjasta efst."), main });
}

// Directory.
{
  const rows = readCsv(join(ROOT, "data/thjonusta.csv")).filter((r) => r.nafn);
  const cats = new Map();
  for (const r of rows) {
    if (!cats.has(r.flokkur)) cats.set(r.flokkur, []);
    cats.get(r.flokkur).push(r);
  }
  const pills = [...cats.keys()].map((c) => `<a class="chip" href="#${slug(c)}">${esc(c)}</a>`).join("");
  const blocks = [...cats].map(([c, list]) => `
      <section class="dir-card" id="${slug(c)}">
        <h2 class="tag tag-opnun"><i></i>${esc(c)}</h2>
        <ul>
${list.map((r) => {
  const name = r.vefur ? `<a href="${esc(r.vefur)}" rel="noopener">${esc(r.nafn)}</a>` : esc(r.nafn);
  const meta = [r.heimilisfang, r.tegund, r.simi].filter(Boolean).map(esc).join(" · ");
  return `          <li><span class="n">${name}</span>${meta ? `<span class="meta">${meta}</span>` : ""}${r.lysing ? `<span class="meta">${esc(r.lysing)}</span>` : ""}</li>`;
}).join("\n")}
        </ul>
      </section>`).join("\n");
  const main = `
  <div class="wrap">
    <div class="filters" aria-label="Flokkar">${pills}</div>
    <div class="dir-grid">${blocks}
    </div>
    <div class="tip">
      <div>
        <strong>Vantar stað á listann?</strong>
        <p>Eða þarf að uppfæra upplýsingar. Sendu okkur línu.</p>
      </div>
      <a class="btn btn-outline" href="mailto:${esc(site.tipEmail)}">Senda ábendingu</a>
    </div>
  </div>`;
  pages.thjonusta = layout({ page: "thjonusta", title: "Þjónusta", root: "../",
    hero: pageHero("Þjónusta í hverfinu", "Yfirlit yfir helstu staði og þjónustu í Hlíðunum. Sjáir þú villu eða vantar eitthvað, láttu okkur vita."), main });
}

// About.
{
  const main = `
  <div class="wrap prose">
    <h2>Hvað er þetta?</h2>
    <p>${esc(site.name)} er lítil vikuleg samantekt fyrir Hlíðar í Reykjavík: viðburðir, nýir staðir og annað markvert í hverfinu. Hún er unnin af einum íbúa sem safnar upplýsingum úr hverfishópum, frá félögum og úr ábendingum sem berast.</p>
    <h2>Senda ábendingu</h2>
    <p>Veistu um viðburð, opnun eða breytingu í hverfinu? Sendu línu á <a href="mailto:${esc(site.tipEmail)}">${esc(site.tipEmail)}</a> og nefndu hvað, hvar og hvenær.</p>
    <h2>Þjónustuskráin</h2>
    <p>Þjónustuskráin er handunnin og uppfærð nokkrum sinnum á ári. Vantar stað eða þarf að laga upplýsingar? Láttu vita.</p>
${site.signupAction ? `    <h2>Póstlistinn</h2>
    <p>Einn póstur í viku með því sem er framundan. Hægt er að afskrá sig hvenær sem er.</p>
` : ""}  </div>`;
  pages.um = layout({ page: "um", title: "Um", root: "../", hero: pageHero("Um " + site.name, "Hverfisvefur fyrir Hlíðarnar."), main });
}

// ---------- write ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), pages.index);
for (const p of ["thjonusta", "lidnir", "um"]) {
  mkdirSync(join(OUT, p), { recursive: true });
  writeFileSync(join(OUT, p, "index.html"), pages[p]);
}
cpSync(join(ROOT, "src/style.css"), join(OUT, "style.css"));
cpSync(join(ROOT, "src/site.js"), join(OUT, "site.js"));
cpSync(join(ROOT, "src/favicon.svg"), join(OUT, "favicon.svg"));
cpSync(join(ROOT, "src/fonts"), join(OUT, "fonts"), { recursive: true });
writeFileSync(join(OUT, "robots.txt"), site.noindex ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\n");
console.log(`Búið til: ${upcoming.length} væntanlegir viðburðir, ${past.length} liðnir (í dag er ${TODAY}).`);
