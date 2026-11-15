import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const source = path.join(root, 'site-src');

const days = {
  1: {
    zip: path.join(root, 'src', 'P1-20261115T063228Z-1-001.zip'),
    folder: 'P1',
    pairs: 4,
  },
  2: {
    zip: path.join(root, 'src', 'P2-20261114T105109Z-1-001.zip'),
    folder: 'P2',
    pairs: 5,
  },
};

const kioskSlugs = new Map([
  ['Food from Cells - kiosk.html', 'food-from-cells'],
  ['Biofilms - kiosk.html', 'biofilms'],
  ['Outbreak Detective - kiosk.html', 'outbreak-detective'],
  ['Rotisserie Check - kiosk.html', 'rotisserie-check'],
]);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of ['tv.js', 'tv.css', 'sw.js']) {
  fs.copyFileSync(path.join(source, file), path.join(dist, file));
}

const pdfVendor = path.join(root, 'node_modules', 'pdfjs-dist');
fs.mkdirSync(path.join(dist, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(pdfVendor, 'build', 'pdf.mjs'), path.join(dist, 'vendor', 'pdf.mjs'));
fs.copyFileSync(path.join(pdfVendor, 'build', 'pdf.worker.mjs'), path.join(dist, 'vendor', 'pdf.worker.mjs'));
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  if (fs.existsSync(path.join(pdfVendor, folder))) fs.cpSync(path.join(pdfVendor, folder), path.join(dist, 'vendor', folder), { recursive: true });
}

const assignments = {};

for (const [dayNumber, config] of Object.entries(days)) {
  const zip = new AdmZip(config.zip);
  const entries = zip.getEntries();
  const pdfs = entries
    .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.pdf'))
    .map((entry) => {
      const match = path.basename(entry.entryName).match(/^P\d+-(\d+)/i);
      if (!match) throw new Error(`Cannot determine poster number: ${entry.entryName}`);
      return { entry, number: Number(match[1]), originalName: path.basename(entry.entryName) };
    })
    .sort((a, b) => a.number - b.number);

  const assetDir = path.join(dist, 'assets', `d${dayNumber}`);
  fs.mkdirSync(assetDir, { recursive: true });
  for (const poster of pdfs) {
    poster.url = `assets/d${dayNumber}/${poster.number}.pdf`;
    fs.writeFileSync(path.join(assetDir, `${poster.number}.pdf`), poster.entry.getData());
  }

  const screens = [];
  let cursor = 0;
  for (let screen = 1; screen <= 10; screen += 1) {
    const count = screen <= config.pairs ? 2 : 1;
    const posters = pdfs.slice(cursor, cursor + count);
    cursor += count;
    if (posters.length !== count) throw new Error(`Not enough Day ${dayNumber} posters for screen ${screen}`);
    screens.push({
      screen,
      posters: posters.map(({ number, url, originalName }) => ({ number, url, originalName })),
    });

    const screenDir = path.join(dist, `d${dayNumber}`, String(screen));
    fs.mkdirSync(screenDir, { recursive: true });
    fs.writeFileSync(path.join(screenDir, 'index.html'), screenHtml(dayNumber, screen), 'utf8');
  }
  if (cursor !== pdfs.length) throw new Error(`Day ${dayNumber} has ${pdfs.length - cursor} unassigned posters`);
  assignments[`day${dayNumber}`] = screens;

  if (dayNumber === '1') {
    for (const [fileName, slug] of kioskSlugs) {
      const entry = entries.find((candidate) => path.basename(candidate.entryName) === fileName);
      if (!entry) throw new Error(`Missing kiosk HTML: ${fileName}`);
      const kioskDir = path.join(dist, 'kiosk', slug);
      fs.mkdirSync(kioskDir, { recursive: true });
      fs.writeFileSync(path.join(kioskDir, 'index.html'), entry.getData());
    }
  }
}

fs.writeFileSync(path.join(dist, 'assignments.json'), JSON.stringify(assignments, null, 2));
fs.writeFileSync(path.join(dist, 'index.html'), directoryHtml(assignments), 'utf8');
fs.cpSync(path.join(root, '.openai'), path.join(dist, '.openai'), { recursive: true });

console.log(`Built ${dist}`);
console.log(`Day 1 screens: ${assignments.day1.length}; Day 2 screens: ${assignments.day2.length}; kiosks: ${kioskSlugs.size}`);

function screenHtml(day, screen) {
  const config = JSON.stringify({ day: Number(day), screen });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <meta name="theme-color" content="#000000">
  <title>Day ${day} - Screen ${screen}</title>
  <link rel="stylesheet" href="../../tv.css">
</head>
<body>
  <main id="display" aria-live="polite">
    <canvas id="poster-a"></canvas>
    <canvas id="poster-b"></canvas>
    <div id="status">Loading posters...</div>
  </main>
  <script>window.TV_CONFIG=${config}</script>
  <script type="module" src="../../tv.js"></script>
</body>
</html>`;
}

function directoryHtml(data) {
  const daySections = [1, 2].map((day) => {
    const links = data[`day${day}`].map((item) => {
      const posterNumbers = item.posters.map((poster) => `P${day}-${poster.number}`).join(' / ');
      return `<a href="d${day}/${item.screen}/"><strong>Screen ${item.screen}</strong><span>${posterNumbers}</span></a>`;
    }).join('');
    return `<section><h2>Day ${day}</h2><div class="grid">${links}</div></section>`;
  }).join('');
  const kioskLinks = [...kioskSlugs].map(([name, slug]) => `<a href="kiosk/${slug}/"><strong>${name.replace(' - kiosk.html', '')}</strong><span>Unmodified HTML</span></a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Food Safety Screens</title><style>
  :root{font-family:Inter,system-ui,sans-serif;color:#f5f7f6;background:#0b1713}body{max-width:1100px;margin:auto;padding:36px 22px 70px}h1{font-size:clamp(2rem,5vw,4.5rem);margin:0 0 8px}p{color:#9fb8af;margin:0 0 44px}section{margin-top:40px}h2{color:#79e7b6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}a{display:flex;flex-direction:column;gap:7px;padding:18px;border:1px solid #29443a;border-radius:14px;background:#13251f;color:#fff;text-decoration:none}a:hover{border-color:#79e7b6;transform:translateY(-1px)}span{font-size:.86rem;color:#9fb8af}
  </style></head><body><h1>Food Safety Screens</h1><p>Direct links for every TV and kiosk.</p>${daySections}<section><h2>Kiosks</h2><div class="grid">${kioskLinks}</div></section></body></html>`;
}
