import { chromium } from './node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url'; import path from 'node:path'; const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const feeds = [
  ['피드 1 · 런칭 캐러셀 (7장)', 'feed1-launch', ['01-cover', '02-problem', '03-how', '04-battle', '05-skills', '06-turtle', '07-cta']],
  ['피드 2 · 거북이 성장 일기 (4장)', 'feed2-turtle', ['01-cover', '02-growth', '03-colors', '04-cta']],
  ['피드 3 · 스킬 8종 (4장)', 'feed3-skills', ['01-cover', '02-attack', '03-defense', '04-cta']],
  ['피드 4 · 촉 테스트 (1장)', 'feed4-quiz', ['01-quiz']],
];
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${ROOT}/_src/fonts.css">
<style>body{margin:0;background:#0b0f17;color:#f2f6fb;font-family:'Noto Sans KR';padding:48px 56px;width:2380px}
h1{font-size:46px;font-weight:900;margin:0 0 6px}p.s{color:#9fb0c6;font-size:24px;margin:0 0 36px}
h2{font-size:30px;font-weight:900;margin:34px 0 14px;color:#7ee0b8}.row{display:flex;gap:18px}.row img{width:300px;height:375px;border-radius:14px;border:1px solid #2a3548}</style>
<h1>Trendist 인스타그램 피드 이미지 미리보기</h1><p class="s">1080×1350 (4:5) · 총 16장 · 왼쪽부터 넘기는 순서</p>
${feeds.map(([t, d, fs_]) => `<h2>${t}</h2><div class="row">${fs_.map((f) => `<img src="file://${ROOT}/${d}/${f}.png">`).join('')}</div>`).join('')}`;
fs.writeFileSync(ROOT + '/_src/_ov.html', html);
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 2380, height: 800 } });
await p.goto('file://' + ROOT + '/_src/_ov.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
await p.screenshot({ path: ROOT + '/00-overview.png', fullPage: true });
await b.close(); fs.unlinkSync(ROOT + '/_src/_ov.html'); console.log('ok');
