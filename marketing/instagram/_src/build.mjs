import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/home/dlrudgjs104/trendist/marketing/instagram';
const SRC = ROOT + '/_src';
const TW = 'file:///tmp/pw/node_modules/@twemoji/svg/';
export const E = (cp, style = '') => `<img class="emo" style="${style}" src="${TW}${cp}.svg">`;
const QR = fs.readFileSync(SRC + '/qr.svg', 'utf8');
const LOGO = 'file:///home/dlrudgjs104/trendist/trendist-front/public/logo.png';

const shell = ({ body, script = '', page = '', pages = '', foot = null, swipe = true }) => `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="file://${SRC}/base.css">
<script src="file://${SRC}/game.bundle.js"></script><script src="file://${SRC}/lib.js"></script>
<body><div class="bg"></div><div class="grid"></div>
<div class="footband"></div>
<div class="top"><div class="brand"><img src="${LOGO}">Trendist</div><div class="pager">${page ? `${page} / ${pages}` : ''}</div></div>
${body}
${foot === null ? '' : `<div class="foot"><span>${foot}</span>${swipe ? '<span class="swipe">넘겨서 보기 →</span>' : '<span></span>'}</div>`}
<script>Promise.all([400,700,900].map((w)=>document.fonts.load(w+' 24px "Noto Sans KR"','가나다라 가')) ).then(()=>{${script}\n});</script></body>`;

export async function render(jobs) {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 140)); });
  for (const j of jobs) {
    fs.mkdirSync(path.dirname(j.out), { recursive: true });
    const html = path.join(SRC, '_tmp.html');
    fs.writeFileSync(html, shell(j.slide));
    await p.goto('file://' + html);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(600);
    await p.screenshot({ path: j.out });
    console.log('saved', path.relative(ROOT, j.out));
  }
  await b.close();
}
export { QR, LOGO, ROOT, SRC };
