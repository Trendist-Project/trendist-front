// 공통 틀(배경·로고·페이지 표시)과 렌더러. 경로는 모두 이 파일 기준이라 어느 PC에서나 `npm install` 뒤 바로 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const SRC = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SRC);
const { chromium } = await import(pathToFileURL(path.join(SRC, 'node_modules/playwright-core/index.mjs')).href);
const TW = 'node_modules/@twemoji/svg/'; // 슬라이드 HTML(_tmp.html)이 이 폴더에 있어 상대 경로로 닿는다
export const E = (cp, style = '') => `<img class="emo" style="${style}" src="${TW}${cp}.svg">`;
const QR = fs.readFileSync(path.join(SRC, 'qr.svg'), 'utf8');
/** 패치노트 시리즈용 QR(UTM `patch`). 없으면 런칭 QR을 쓴다 */
const QR_PATCH = fs.existsSync(path.join(SRC, 'qr-patch.svg')) ? fs.readFileSync(path.join(SRC, 'qr-patch.svg'), 'utf8') : QR;
const LOGO = pathToFileURL(path.resolve(ROOT, '../../public/logo.png')).href;
const PUBLIC = pathToFileURL(path.resolve(ROOT, '../../public')).href;

const shell = ({ body, script = '', page = '', pages = '', foot = null, swipe = true, tag = '' }) => `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="base.css">
<script src="game.bundle.js"></script><script src="lib.js"></script>
<body><div class="bg"></div><div class="grid"></div>
<div class="footband"></div>
<div class="top"><div class="brand"><img src="${LOGO}">Trendist</div><div class="pager">${page ? `${page} / ${pages}` : tag}</div></div>
${body}
${foot === null ? '' : `<div class="foot"><span>${foot}</span>${swipe ? '<span class="swipe">넘겨서 보기 →</span>' : '<span></span>'}</div>`}
<script>Promise.all([400,700,900].map((w)=>document.fonts.load(w+' 24px "Noto Sans KR"','가나다라 가')) ).then(()=>{${script}\n${FIT}});</script></body>`;

// 패치노트 틀(.pn + .cta)의 자동 맞춤: 내용이 QR 블록에 닿으면 QR을 작게(compact) 내리고, 그래도 닿으면 그림(.vis)을 줄이고,
// 내용이 짧아 빈 자리가 크면 내용을 조금 내려 가운데에 가깝게 둔다
const FIT = `
const pn=document.querySelector('.pn'),cta=document.querySelector('.cta');
if(pn&&cta){const gap=()=>cta.getBoundingClientRect().top-pn.getBoundingClientRect().bottom;const MIN=26;
 if(gap()<MIN&&!cta.classList.contains('compact'))cta.classList.add('compact');
 if(gap()<MIN){const vis=pn.querySelector('.vis');if(vis){const h=vis.getBoundingClientRect().height;vis.style.zoom=Math.max(.55,(h+gap()-MIN)/h);}}
 const g=gap();if(g>120)pn.style.top=(168+Math.min((g-80)/2,150))+'px';}`;

export async function render(jobs) {
  // 크로미엄이 필요한 시스템 라이브러리(libnss3 등)가 없으면 `.libs/`에 둔 것을 쓴다(README "다시 만들 때 필요한 것")
  const libs = path.join(SRC, '.libs');
  const env = fs.existsSync(libs) ? { ...process.env, LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } : undefined;
  const b = await chromium.launch({ headless: true, env });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 140)); });
  for (const j of jobs) {
    fs.mkdirSync(path.dirname(j.out), { recursive: true });
    const html = path.join(SRC, '_tmp.html');
    fs.writeFileSync(html, shell(j.slide));
    await p.goto(pathToFileURL(html).href);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(700);
    await p.screenshot({ path: j.out });
    console.log('saved', path.relative(ROOT, j.out));
  }
  await b.close();
  fs.rmSync(path.join(SRC, '_tmp.html'), { force: true });
}
export { QR, QR_PATCH, LOGO, PUBLIC, ROOT, SRC };
