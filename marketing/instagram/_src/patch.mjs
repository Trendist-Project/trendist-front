// 패치노트 피드(한 피드 = 사진 1장 + 캡션). 템플릿은 feed2-turtle/04-cta.png 양식이다:
// 왼쪽 위 로고·이름, 가운데 제목·그림·설명, 아래 QR + trendist.kr + "설치 없이 · 가입 없이 · 바로 시작".
// 내용이 많으면 QR 블록을 작게(compact) 더 아래로 내린다. 실행: `npm run build:patch` (이 폴더에서)
// 결과: ../patch-notes/NN-xxx.png 와 ../patch-notes/feeds.md(캡션 모음, 이 파일에서 생성)
import fs from 'node:fs';
import path from 'node:path';
import { render, E, QR_PATCH, PUBLIC, ROOT } from './build.mjs';

const OUT = path.join(ROOT, 'patch-notes');
const QRP = QR_PATCH.replace('<svg ', '<svg style="width:100%;height:100%" ');

const CSS = `<style>
.pn-pill { display:inline-flex; align-items:center; gap:10px; padding:10px 22px; border-radius:999px; font-weight:900; font-size:28px; margin-bottom:26px; }
.pn-new { background:rgba(63,182,139,.16); border:1.5px solid rgba(63,182,139,.5); color:var(--mint); }
.pn-rule { background:rgba(255,209,102,.14); border:1.5px solid rgba(255,209,102,.5); color:var(--amber); }
.pn-skill { background:rgba(169,139,255,.15); border:1.5px solid rgba(169,139,255,.5); color:var(--violet); }
.pn-fix { background:rgba(124,211,255,.14); border:1.5px solid rgba(124,211,255,.5); color:var(--sky); }
.pn-fun { background:rgba(255,107,138,.14); border:1.5px solid rgba(255,107,138,.5); color:#ff9ab0; }
.pn h1 { font-size:84px; }
.pn .vis { margin:30px auto 0; display:flex; justify-content:center; align-items:center; }
.pn .desc { margin:22px auto 0; font-size:31px; color:var(--muted); line-height:1.45; max-width:900px; }
.pn .desc b { color:#fff; font-weight:900; }
.cta { position:absolute; left:64px; right:64px; bottom:232px; display:flex; align-items:center; justify-content:center; gap:40px; z-index:5; }
.cta .qr { width:230px; height:230px; border-radius:28px; background:#fff; padding:18px; flex:none; }
.cta .url { font-weight:900; font-size:68px; letter-spacing:-.02em; text-align:left; }
.cta .sub { margin-top:12px; font-size:30px; color:var(--muted); text-align:left; }
.cta.compact { bottom:186px; gap:30px; }
.cta.compact .qr { width:150px; height:150px; border-radius:20px; padding:12px; }
.cta.compact .url { font-size:50px; } .cta.compact .sub { font-size:24px; margin-top:6px; }
.kcap { display:inline-grid; place-items:center; min-width:64px; height:64px; padding:0 18px; border-radius:14px; background:#1b2433; border:2px solid #3a475c; box-shadow:0 4px 0 #0b0f17; font-weight:900; font-size:30px; color:#fff; }
.slot { width:150px; height:150px; border-radius:28px; border:3px solid #3a475c; background:linear-gradient(180deg,rgba(27,36,51,.96),rgba(20,27,38,.96)); display:grid; place-items:center; position:relative; font-size:70px; }
.slot .n { position:absolute; left:12px; top:6px; font-weight:900; font-size:24px; color:#7f90a8; }
.chip { display:inline-flex; align-items:center; gap:8px; padding:10px 20px; border-radius:999px; background:rgba(255,209,102,.12); border:1.5px solid rgba(255,209,102,.45); color:#ffe29a; font-weight:900; font-size:27px; }
.hpbar { height:34px; border-radius:999px; background:#2a1620; border:2px solid #5a2634; overflow:hidden; position:relative; }
.hpbar i { position:absolute; left:0; top:0; bottom:0; background:linear-gradient(90deg,#ff6b6b,#ff9a9a); border-radius:999px; }
.stat { background:linear-gradient(180deg,rgba(27,36,51,.96),rgba(20,27,38,.96)); border:1.5px solid var(--line); border-radius:24px; padding:20px 18px; text-align:center; }
.stat .v { font-weight:900; font-size:44px; line-height:1.1; } .stat .k { margin-top:8px; font-size:24px; color:var(--muted); }
</style>`;

/** 패치노트 한 장의 공통 틀 */
const slide = ({ n, kind, tag, title, visual = '', desc = '', compact = false, script = '', foot = '#게임 #게임추천 #트랜드 #이슈' }) => ({
  tag: '', foot, swipe: false, script, // 오른쪽 위 번호 표시는 두지 않는다(n은 파일 순서용)
  body: `${CSS}
<div class="content pn" style="top:168px;text-align:center">
  <div class="pn-pill pn-${kind}">${tag}</div>
  <h1>${title}</h1>
  <div class="vis">${visual}</div>
  ${desc ? `<div class="desc">${desc}</div>` : ''}
</div>
<div class="cta${compact ? ' compact' : ''}"><div class="qr">${QRP}</div><div><div class="url">trendist<span class="em">.kr</span></div><div class="sub">설치 없이 · 가입 없이 · 바로 시작</div></div></div>`,
});
const cv = (id, w, h) => `<canvas id="${id}" style="width:${w}px;height:${h}px"></canvas>`;
const hi = (ctx) => `ctx.save();ctx.font='900 36px "Noto Sans KR"';ctx.textAlign='center';ctx.lineWidth=9;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.lineJoin='round';`;
const CREDIT = '(이모지 그래픽: Twemoji, CC-BY 4.0)';
const CTA = '👉 프로필 링크 또는 QR로 바로 시작 (설치 없이 · 가입 없이)';
// 캡션 해시태그: 공통(한글) + 게시물별 태그가 한 줄, 그 다음 줄에 공통(영문). 영문 줄은 feeds.md를 쓸 때 캡션 끝에 붙인다
const TAGS = '#게임 #게임추천 #트랜드 #이슈 #트렌디스트';
const TAGS_EN = '#game #trend #issue #trendist';

/* ============ 피드 정의(게시 순서) ============ */
const feeds = [];

feeds.push({ post: '2026-12-03', file: 'wheel', note: '마지막 게시물', caption: `하루 한 번, 돌림판 🎡

메뉴(☰)에서 돌림판을 돌리면 멈춘 칸의 숫자만큼 🔥 활성 키워드가 바로 보관함에 들어와요.
칸은 1·2·3·4·5·6·8·10·15·20. 최대 20개!
10레벨부터, 하루에 한 번이에요. 오늘 아직 안 돌렸으면 ☰에 빨간 점이 떠요.

${CTA}

${CREDIT}
${TAGS} #돌림판 #룰렛 #일일보상`,
  slide: slide({ n: 1, kind: 'new', tag: `${E('1f3a1')} 새 기능`, title: '하루 한 번,<br><span class="em">돌림판</span>', compact: true,
    visual: cv('c', 440, 440),
    desc: `멈춘 칸의 숫자만큼 <b>${E('1f525')} 키워드를 바로</b> 받아요 (최대 <b>20개</b>)<br>메뉴(☰) → ${E('1f3a1')} 돌림판 · 10레벨부터 · 하루 한 번`,
    script: `const c=document.getElementById('c');c.width=880;c.height=880;const ctx=c.getContext('2d');ctx.scale(2,2);
const nums=[1,2,3,4,5,6,8,10,15,20],cols=['#3fb68b','#4f8cff','#3fb68b','#4f8cff','#3fb68b','#4f8cff','#3fb68b','#4f8cff','#a98bff','#ffd166'];
const cx=220,cy=228,R=190;ctx.save();ctx.shadowColor='rgba(126,224,184,.45)';ctx.shadowBlur=40;ctx.fillStyle='#141b26';ctx.beginPath();ctx.arc(cx,cy,R+12,0,Math.PI*2);ctx.fill();ctx.restore();
for(let i=0;i<10;i++){const a0=-Math.PI/2+i*Math.PI/5-Math.PI/10,a1=a0+Math.PI/5;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,a0,a1);ctx.closePath();ctx.fillStyle=cols[i];ctx.globalAlpha=i===9?1:.85;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='#0b0f17';ctx.lineWidth=4;ctx.stroke();
 const am=(a0+a1)/2;ctx.save();ctx.translate(cx+Math.cos(am)*R*.68,cy+Math.sin(am)*R*.68);ctx.font='900 '+(i===9?44:34)+'px "Noto Sans KR"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=i===9?'#0b0f17':'#fff';ctx.fillText(nums[i],0,0);ctx.restore();}
ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=8;ctx.stroke();
ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(cx,cy,34,0,Math.PI*2);ctx.fill();ctx.fillStyle='#0b0f17';ctx.font='900 30px "Noto Sans KR"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('GO',cx,cy+1);
ctx.fillStyle='#ffd166';ctx.beginPath();ctx.moveTo(cx-22,10);ctx.lineTo(cx+22,10);ctx.lineTo(cx,58);ctx.closePath();ctx.fill();ctx.strokeStyle='#0b0f17';ctx.lineWidth=4;ctx.stroke();` }) });

feeds.push({ post: '2026-12-02', file: 'boss', note: '보스 보상과 한 게시물로', caption: `매시 정각, 장로 거북이가 옵니다 👑

안경 쓴 거대 거북이가 아레나에 10분 동안 머물러요. 모두 함께 쓰러뜨리는 협동 보스예요.
🐢 부딪히면 내 유행도만큼 피해 (키워드는 안 잃어요)
🔥 불꽃이면 5배! 몇 번 치면 콤보로 불꽃이 붙어요
⚠️ 돌진·충격고리는 피하고, 체력 20% 아래에선 분노해요

쓰러뜨리면 전원에게 보상. 1분 전에 예고가 떠요.

${CTA}

${CREDIT}
${TAGS} #보스 #레이드 #협동 #장로거북이`,
  slide: slide({ n: 2, kind: 'new', tag: `${E('1f451')} 새 기능 · 보스`, title: '매시 정각,<br><span class="em">장로 거북이</span>가 옵니다', compact: true,
    visual: `<div style="position:relative;width:420px;height:400px"><div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(255,107,107,.25),transparent 70%)"></div><img src="${PUBLIC}/monsters/elder-turtle.svg" style="position:absolute;left:30px;top:10px;width:360px;height:360px;filter:drop-shadow(0 0 30px rgba(255,107,107,.35))"><div style="position:absolute;left:0;right:0;bottom:0"><div style="display:flex;justify-content:space-between;font-weight:900;font-size:24px;margin-bottom:6px"><span>${E('1f451')} 장로 거북이</span><span style="color:var(--muted)">09:41</span></div><div class="hpbar"><i style="width:72%"></i></div></div></div>`,
    desc: `10분 동안 <b>모두 함께</b> 쓰러뜨리는 협동 보스<br>부딪히면 <b>내 유행도만큼</b> 피해, ${E('1f525')} 불꽃이면 <b>5배</b>` }) });

feeds.push({ post: '2026-12-02', file: 'boss-reward', note: '보스와 한 게시물로', caption: `보스 보상은 기여도 비례 🏆

보스를 쓰러뜨리면 참여한 모두가
🔥 활성 키워드 10개
📈 전체 피해 중 내 몫만큼 레벨 진행 %
를 받아요. 피해 30%를 넣었으면 지금 레벨의 30%가 한 번에 차요.

시간 안에 못 잡으면 보상은 없어요. 끝나면 피해 TOP 5가 카드로 떠요.

${CTA}

${CREDIT}
${TAGS} #보스보상 #레이드 #기여도`,
  slide: slide({ n: 3, kind: 'new', tag: `${E('1f3c6')} 보스 보상`, title: '보스 보상은<br><span class="amber">기여도 비례</span>',
    visual: `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;width:940px"><div class="stat"><div class="v">${E('1f525')} 10개</div><div class="k">활성 키워드<br>참여자 전원</div></div><div class="stat" style="border-color:rgba(255,209,102,.5)"><div class="v amber">내 몫 %</div><div class="k">전체 피해 중 내 비율<br>= 레벨 진행 %</div></div><div class="stat"><div class="v">TOP 5</div><div class="k">끝나면 피해 순위<br>카드로 공개</div></div></div>`,
    desc: `피해 <b>30%</b>를 넣었으면 지금 레벨이 <b>30%</b> 차요<br>못 잡으면 보상 없음 · 참여 기준은 최대 체력의 0.5% 이상` }) });

feeds.push({ post: '2026-12-01', file: 'hp', caption: `체력(HP)이 생겼어요 ❤️

이제 부딪히면 키워드만 잃는 게 아니라 체력도 깎여요.
피해 = 100 × 공격력 ÷ (공격력 + 상대 유행도)
비슷한 상대면 서로 50점씩, 9배 센 상대에겐 90점을 맞아요.

💀 죽으면 가진 키워드의 절반을 잃어요
💙 가운데 세이프존에서 1초에 2%씩 회복
✨ 새 키워드를 얻으면 그만큼 회복

${CTA}

${CREDIT}
${TAGS} #체력 #HP #전투 #업데이트`,
  slide: slide({ n: 4, kind: 'rule', tag: `${E('2764')} 새 전투 규칙`, title: '체력(HP)이<br><span class="red">생겼어요</span>', compact: true,
    visual: `<div style="width:900px"><div style="display:flex;justify-content:space-between;font-weight:900;font-size:30px;margin-bottom:10px"><span>HP</span><span class="red">82%</span></div><div class="hpbar" style="height:44px"><i style="width:82%"></i></div><div class="card" style="margin-top:28px;padding:24px 30px;font-size:34px;font-weight:900;line-height:1.4">피해 = 100 × <span class="em">공격력</span> ÷ (<span class="em">공격력</span> + <span class="amber">상대 유행도</span>)</div></div>`,
    desc: `비슷하면 서로 <b>50점</b>, 9배 센 상대에겐 <b>90점</b><br><b>죽으면</b> 키워드 <b>절반</b>을 잃어요 · 가운데 세이프존에서 <b>1초에 2%</b> 회복` }) });

feeds.push({ post: '2026-11-30', file: 'heal', caption: `새 스킬: 회복 ➕

최대 체력의 50%를 그 자리에서 바로 채워요. 세이프존 밖에서도 OK.
쿨타임 60초, 40레벨부터 쓸 수 있어요.
체력이 이미 가득이면 쓰이지 않고 쿨타임도 안 돌아요.

보스전에서 세이프존까지 돌아갈 시간이 없을 때 꼭 필요해요.

${CTA}

${CREDIT}
${TAGS} #스킬 #회복 #힐 #보스`,
  slide: slide({ n: 5, kind: 'skill', tag: `${E('2795')} 새 스킬`, title: '회복,<br><span class="em">50%를 바로</span>',
    visual: cv('c', 420, 360),
    desc: `세이프존 밖에서도 <b>최대 체력의 50%</b>를 즉시<br>쿨타임 <b>60초</b> · <b>40레벨</b>부터`,
    script: `const c=document.getElementById('c');c.width=840;c.height=720;const ctx=c.getContext('2d');ctx.scale(2,2);
const g=ctx.createRadialGradient(210,190,20,210,190,200);g.addColorStop(0,'rgba(126,224,184,.35)');g.addColorStop(1,'rgba(126,224,184,0)');ctx.fillStyle=g;ctx.fillRect(0,0,420,360);
L.orb(ctx,210,170,120,{level:10,me:true,glow:'rgba(126,224,184,.5)',lw:9});
for(const [x,y,s,a] of [[300,40,56,1],[120,60,36,.8],[330,220,30,.7],[90,220,24,.6]]){ctx.save();ctx.globalAlpha=a;ctx.fillStyle='#4ade80';ctx.strokeStyle='rgba(0,0,0,.5)';ctx.lineWidth=4;ctx.lineJoin='round';ctx.beginPath();const t=s*.3;ctx.rect(x-t/2,y-s/2,t,s);ctx.rect(x-s/2,y-t/2,s,t);ctx.fill();ctx.stroke();ctx.restore();}
${hi()}ctx.font='900 40px "Noto Sans KR"';ctx.strokeText('+50%',210,352);ctx.fillStyle='#4ade80';ctx.fillText('+50%',210,352);ctx.restore();` }) });

feeds.push({ post: '2026-11-29', file: 'flame', caption: `5콤보면 불꽃이 붙어요 🔥

키워드를 연속으로 5번 빼앗으면 원 둘레가 불타올라요.
불꽃인 채로 부딪히면 유행도와 상관없이 이기고, 상대 키워드의 절반을 날려요.
불꽃이면 공격력이 5배!

단, 한 번이라도 지면 바로 꺼져요. 5분 동안 콤보가 안 오르면 사라져요.
불타는 사람을 보면? 쫓아가서 꺼 보세요. 그것도 칭호예요 🧯

${CTA}

${CREDIT}
${TAGS} #콤보 #불꽃 #pvp #전략`,
  slide: slide({ n: 6, kind: 'rule', tag: `${E('1f525')} 핵심 규칙`, title: '5콤보면<br><span class="amber">불꽃이 붙어요</span>', compact: true,
    visual: cv('c', 500, 400),
    desc: `불꽃이면 <b>유행도와 상관없이 이기고</b> 상대 키워드 <b>절반</b>을 날려요<br>공격력 <b>5배</b> · 한 번이라도 지면 꺼져요`,
    script: `const c=document.getElementById('c');c.width=1000;c.height=800;const ctx=c.getContext('2d');ctx.scale(2,2);
const x=250,y=215,r=110;const g=ctx.createRadialGradient(x,y,r,x,y,r*1.9);g.addColorStop(0,'rgba(255,140,40,.35)');g.addColorStop(1,'rgba(255,140,40,0)');ctx.fillStyle=g;ctx.fillRect(0,0,500,400);
for(let i=0;i<34;i++){const a=i/34*Math.PI*2,h=r*(0.32+0.22*Math.abs(Math.sin(i*2.3)));const bx=x+Math.cos(a)*r*.96,by=y+Math.sin(a)*r*.96,tx=x+Math.cos(a+.08)*(r+h),ty=y+Math.sin(a+.08)*(r+h);
 const l=ctx.createLinearGradient(bx,by,tx,ty);l.addColorStop(0,'#ffd166');l.addColorStop(.5,'#ff8c42');l.addColorStop(1,'rgba(255,80,40,0)');ctx.fillStyle=l;ctx.beginPath();ctx.moveTo(x+Math.cos(a-.11)*r,y+Math.sin(a-.11)*r);ctx.quadraticCurveTo(x+Math.cos(a-.03)*(r+h*.6),y+Math.sin(a-.03)*(r+h*.6),tx,ty);ctx.quadraticCurveTo(x+Math.cos(a+.13)*(r+h*.5),y+Math.sin(a+.13)*(r+h*.5),x+Math.cos(a+.11)*r,y+Math.sin(a+.11)*r);ctx.closePath();ctx.fill();}
L.orb(ctx,x,y,r,{level:10,me:true,lw:9});
ctx.save();ctx.translate(400,60);ctx.fillStyle='rgba(255,140,40,.18)';ctx.strokeStyle='#ff8c42';ctx.lineWidth=3;const w=150,h=56;ctx.beginPath();ctx.roundRect(-w/2,-h/2,w,h,16);ctx.fill();ctx.stroke();ctx.font='900 30px "Noto Sans KR"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText('🔥',-45,1);ctx.fillText('5 Combo',18,1);ctx.restore();` }) });

feeds.push({ post: '2026-11-28', file: 'orbs', caption: `? 구슬과 ! 구슬, 뭐가 달라요? 🔮

🟡 ? 구슬: 55%는 🔥 키워드를 얻고, 45%는 가진 키워드 하나를 잃어요. 타이핑 없이 키워드를 얻는 방법이지만 도박이에요. (확률은 바뀔 수 있어요. 지금 값은 게임 가이드에서 확인)
🔴 ! 구슬: 꽝도 잃기도 없이 100% 🔥 키워드. 불꽃에 맞거나 체력이 0이 된 사람 주변에 흩어져요(90초 뒤 사라짐).

붉은 구슬이 보이면 일단 달려가세요. 미니맵에도 붉은 점으로 떠요.

${CTA}

${CREDIT}
${TAGS} #구슬 #확률 #공략`,
  slide: slide({ n: 7, kind: 'rule', tag: `${E('1f52e')} 핵심 규칙`, title: '<span class="amber">? 구슬</span>과 <span class="red">! 구슬</span><br>뭐가 달라요?',
    visual: cv('c', 940, 330),
    desc: `<b class="amber">?</b> 55% 얻고 45% 잃는 도박(확률은 바뀔 수 있어요) · <b class="red">!</b> 꽝 없이 <b>100%</b><br>! 구슬은 불꽃에 맞거나 죽은 사람 둘레에 떨어져요`,
    script: `const c=document.getElementById('c');c.width=1880;c.height=660;const ctx=c.getContext('2d');ctx.scale(2,2);
function orbi(x,y,col,glow,ch,txt,sub,scol){const g=ctx.createRadialGradient(x,y,40,x,y,150);g.addColorStop(0,glow);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-150,y-150,300,300);
 const b=ctx.createRadialGradient(x-25,y-30,10,x,y,90);b.addColorStop(0,'#fff8d6');b.addColorStop(.3,col);b.addColorStop(1,scol);ctx.fillStyle=b;ctx.beginPath();ctx.arc(x,y,88,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=5;ctx.stroke();
 ctx.font='900 92px "Noto Sans KR"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#0b0f17';ctx.fillText(ch,x,y+6);
 ${hi()}ctx.font='900 44px "Noto Sans KR"';ctx.strokeText(txt,x,y+150);ctx.fillStyle='#fff';ctx.fillText(txt,x,y+150);ctx.font='700 26px "Noto Sans KR"';ctx.lineWidth=7;ctx.strokeText(sub,x,y+190);ctx.fillStyle='#9fb0c6';ctx.fillText(sub,x,y+190);ctx.restore();}
orbi(250,120,'#ffd166','rgba(255,209,102,.35)','?','55% 얻음 · 45% 잃음','금빛 · 아레나 곳곳','#b8860b');
orbi(690,120,'#ff6b6b','rgba(255,107,107,.4)','!','100% 얻음','붉은빛 · 불꽃·사망 자리','#8b1e1e');
ctx.font='900 60px "Noto Sans KR"';ctx.fillStyle='#3a475c';ctx.textAlign='center';ctx.fillText('vs',470,135);` }) });

feeds.push({ post: '2026-11-27', file: 'dash', caption: `스페이스바, 대시 ⚡

3초 동안 최대 속도가 2배가 돼요. 쫓기면 도망, 쫓을 땐 추격.
PC는 스페이스바, 모바일은 스킬 줄 오른쪽의 ⚡ 버튼.
쓰면 하늘색 꼬리가 지나온 길을 따라 휘어져서 모두의 화면에 보여요.

쿨타임은 10초. 움직이는 중에만 써져요.

${CTA}

${CREDIT}
${TAGS} #대시 #조작 #스피드`,
  slide: slide({ n: 8, kind: 'skill', tag: `${E('26a1')} 기본 스킬`, title: '스페이스바,<br><span style="color:var(--sky)">대시</span>',
    visual: cv('c', 940, 300),
    desc: `3초 동안 최대 속도 <b>2배</b> · 쿨타임 10초 · 모바일은 <b>${E('26a1')} 버튼</b><br>지나온 길을 따라 휘어지는 하늘색 꼬리가 모두에게 보여요`,
    script: `const c=document.getElementById('c');c.width=1880;c.height=600;const ctx=c.getContext('2d');ctx.scale(2,2);
const pts=[];for(let i=0;i<=60;i++){const t=i/60;pts.push([90+t*560,150+Math.sin(t*Math.PI*1.2)*70*(1-t)]);}
for(let k=14;k>=1;k--){const w=k/14;ctx.strokeStyle='rgba(124,211,255,'+(0.07+0.1*(1-w))+')';ctx.lineWidth=70*w;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();pts.forEach((p,i)=>{if(i===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);});ctx.stroke();}
ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=5;ctx.beginPath();pts.slice(30).forEach((p,i)=>{if(i===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);});ctx.stroke();
L.orb(ctx,650,150,70,{level:10,me:true,glow:'rgba(124,211,255,.7)',lw:7});
ctx.strokeStyle='rgba(124,211,255,.55)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(650,150,98,0,Math.PI*2);ctx.stroke();
${hi()}ctx.font='900 52px "Noto Sans KR"';ctx.strokeText('⚡',650,70);ctx.fillStyle='#ffd166';ctx.fillText('⚡',650,70);ctx.restore();
ctx.save();ctx.translate(820,150);ctx.fillStyle='#1b2433';ctx.strokeStyle='#3a475c';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-55,-32,110,64,14);ctx.fill();ctx.stroke();ctx.fillStyle='#0b0f17';ctx.fillRect(-55,30,110,6);ctx.font='900 22px "Noto Sans KR"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText('SPACE',0,0);ctx.restore();` }) });

feeds.push({ post: '2026-11-26', file: 'loadout', caption: `스킬은 4칸, 조합은 내 마음 ⌨️

K 키로 스킬창을 열어 4칸에 원하는 스킬을 끼워요. 대시는 장착 없이 늘 써요.
칸마다 단축키도 바꿀 수 있고, 서버에 저장돼서 다른 기기에서도 그대로예요.
쿨타임은 스킬마다 따로 세니까 싸우는 중에 바꿔도 돼요.

공격형(갈고리·충격파·독·암흑)? 생존형(방패·은신·정화·회복)? 댓글로 조합 알려 주세요 👇

${CTA}

${CREDIT}
${TAGS} #스킬 #장착 #빌드 #단축키`,
  slide: slide({ n: 9, kind: 'fix', tag: `${E('2328')} 개선`, title: '스킬은 4칸,<br><span class="em">조합은 내 마음</span>',
    visual: `<div style="display:flex;gap:18px;align-items:center"><div class="slot"><span class="n">1</span>${E('1fa9d')}</div><div class="slot"><span class="n">2</span>${E('1f6e1')}</div><div class="slot"><span class="n">3</span>${E('2620')}</div><div class="slot"><span class="n">4</span>${E('2795')}</div><div style="width:12px"></div><div class="slot" style="width:120px;height:120px;border-color:rgba(255,209,102,.6);font-size:54px"><span class="n" style="color:var(--amber)">${E('26a1')}</span>${E('26a1')}</div></div>`,
    desc: `<span class="kcap">K</span>&nbsp; 스킬창에서 끼우고 빼고, <b>단축키도 바꿔요</b> (서버 저장)<br>쿨타임은 스킬마다 따로 세서 싸우는 중에 바꿔도 돼요` }) });

const scene = (id, cfg) => `L.fxScene(document.getElementById('${id}'),${cfg});`;
feeds.push({ post: '2026-11-25', file: 'poison', caption: `독: 9초 동안 3번 잃어요 ☠️

겨눈 방향으로 독을 던져요. 맞으면 9초 동안 3초마다 키워드가 하나씩 빠져요.
끝나기 전에 또 맞으면 스택이 올라서 틱마다 2개, 3개… 최대 10스택.
맞은 사람 머리 위에 ☠ ×스택이 모두에게 보여요.

해독은 ✨ 정화로. 35레벨부터 열려요.

${CTA}

${CREDIT}
${TAGS} #스킬 #독 #pvp`,
  slide: slide({ n: 10, kind: 'skill', tag: `${E('2620')} 스킬`, title: '독: 9초 동안<br><span style="color:#5fe08a">3번 잃어요</span>',
    visual: cv('a', 940, 330),
    desc: `3초마다 키워드 하나 · 또 맞으면 <b>스택</b>이 올라 틱마다 더 잃어요<br>최대 10스택 · ${E('2728')} 정화로 해독 · 35레벨부터`,
    script: scene('a', `{w:940,h:330,actors:{1:{x:170,y:170,r:70,level:10,me:true},2:{x:720,y:170,r:70,level:4,bg:'#4f8cff',name:'상대',nameSize:26}},events:[[0,{id:'bolt',kind:'poison',bid:1,e:1,x:240,y:170,dx:1,dy:0,speed:300,range:420,radius:14}],[900,{id:'boltEnd',bid:1,hit:2,x:650,y:170}],[900,{id:'poison',t:2,stacks:2,ms:9000}]],at:1500,extra:(ctx)=>{${hi()}ctx.font='900 40px "Noto Sans KR"';ctx.strokeText('키워드 -2',470,120);ctx.fillStyle='#ff8a8a';ctx.fillText('키워드 -2',470,120);ctx.restore();}}`) }) });

feeds.push({ post: '2026-11-24', file: 'darkness', caption: `암흑: 3초 동안 앞이 안 보여요 🕶️

검은 투사체를 던져요. 맞은 사람은 3초 동안 자기 원 주변만 보이고 나머지는 검은 연기로 덮여요. 미니맵도 사라져요.
걸린 원은 모두에게 보라색 안개와 🕶️ 표시가 보여서, 그 틈에 몰아가기 좋아요.

봇도 맞으면 똑같이 시야가 좁아져요. 25레벨부터.

${CTA}

${CREDIT}
${TAGS} #스킬 #암흑 #시야`,
  slide: slide({ n: 11, kind: 'skill', tag: `${E('1f576')} 스킬`, title: '암흑: 3초 동안<br><span style="color:var(--violet)">앞이 안 보여요</span>',
    visual: cv('a', 940, 330),
    desc: `맞은 사람은 <b>자기 원 주변만</b> 보이고 미니맵도 사라져요<br>걸린 원은 모두에게 보라 안개로 보여요 · 봇도 걸려요 · 25레벨부터`,
    script: scene('a', `{w:940,h:330,actors:{1:{x:170,y:170,r:70,level:10,me:true},2:{x:720,y:170,r:70,level:4,bg:'#4f8cff',name:'상대',nameSize:26}},events:[[0,{id:'bolt',kind:'darkness',bid:1,e:1,x:240,y:170,dx:1,dy:0,speed:300,range:420,radius:14}],[900,{id:'boltEnd',bid:1,hit:2,x:650,y:170}],[900,{id:'darkness',t:2,ms:3000}]],at:1500}`) }) });

feeds.push({ post: '2026-11-23', file: 'cleanse', caption: `정화: 걸린 건 한 번에 풀어요 ✨

독, 암흑, 갈고리에 끌려가는 중… 전부 한 번에 해제.
끌려가는 동안에도 쓸 수 있어서 갈고리 콤보를 끊어 버릴 수 있어요.
하늘색 테두리가 금이 가며 조각조각 튀는 연출은 모두에게 보여요.

쿨타임 30초, 30레벨부터.

${CTA}

${CREDIT}
${TAGS} #스킬 #정화 #생존`,
  slide: slide({ n: 12, kind: 'skill', tag: `${E('2728')} 스킬`, title: '정화: 걸린 건<br><span style="color:var(--sky)">한 번에 풀어요</span>',
    visual: cv('a', 940, 330),
    desc: `독 · 암흑 · 갈고리에 끌려가는 중을 <b>한 번에 해제</b><br>끌려가는 동안에도 써요 · 쿨타임 30초 · 30레벨부터`,
    script: scene('a', `{w:940,h:330,actors:{1:{x:470,y:170,r:80,level:10,me:true}},events:[[0,{id:'cleanse',e:1}]],at:330,extra:(ctx)=>{${hi()}ctx.font='900 34px "Noto Sans KR"';[['☠','독',200,120],['🕶','암흑',200,200],['🪝','갈고리',740,160]].forEach(([e,t,x,y])=>{ctx.textAlign='left';ctx.fillText(e,x-70,y);ctx.strokeText(t,x-24,y);ctx.fillStyle='#6b7a90';ctx.fillText(t,x-24,y);ctx.strokeStyle='#ff6b6b';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x-80,y-12);ctx.lineTo(x+80,y-12);ctx.stroke();ctx.strokeStyle='rgba(0,0,0,.7)';ctx.lineWidth=9;});ctx.restore();}}`) }) });

feeds.push({ post: '2026-11-22', file: 'hook', caption: `갈고리: 끌어와서 하나 뺏기 🪝

겨눈 방향으로 갈고리를 던져요. 처음 닿은 원이 0.3초 만에 내 앞으로 끌려오고 키워드 1개를 뺏겨요.
끌려오는 동안은 움직이지도 스킬을 쓰지도 못해요. 끌려와서 부딪히면 유행도가 낮은 쪽이 하나 더 잃어요.

도망가는 상대를 잡을 때 최고. 10레벨부터.

${CTA}

${CREDIT}
${TAGS} #스킬 #갈고리 #pvp`,
  slide: slide({ n: 13, kind: 'skill', tag: `${E('1fa9d')} 스킬`, title: '갈고리: 끌어와서<br><span style="color:#ff9ab0">하나 뺏기</span>',
    visual: cv('a', 940, 330),
    desc: `처음 닿은 원이 <b>0.3초</b> 만에 끌려오며 키워드 <b>1개</b>를 뺏겨요<br>끌려오는 동안은 못 움직이고, 부딪히면 하나 더 · 10레벨부터`,
    script: scene('a', `{w:940,h:330,actors:{1:{x:170,y:170,r:72,level:10,me:true},2:{x:620,y:170,r:66,level:4,bg:'#4f8cff',name:'상대',nameSize:26}},events:[[0,{id:'hook',e:1,dx:1,dy:0,range:520,ms:450}],[500,{id:'hookHit',e:1,t:2,ms:700}]],at:760,extra:(ctx)=>{${hi()}ctx.font='900 40px "Noto Sans KR"';ctx.strokeText('키워드 -1',620,70);ctx.fillStyle='#ff8a8a';ctx.fillText('키워드 -1',620,70);ctx.restore();}}`) }) });

feeds.push({ post: '2026-11-21', file: 'stealth', caption: `은신 중인 적이 가까우면 ! 👻

은신하면 5초 동안 남에게는 배경과 똑같아져서 안 보여요. 이름표도 미니맵도 사라져요.
대신 은신한 적이 내 화면 안에 들어오면 내 원 위에 빨간 !가 떠요. 어디 있는지는 안 알려 줘요.

!가 뜨면 멈추지 말고 움직이세요. 20레벨부터.

${CTA}

${CREDIT}
${TAGS} #스킬 #은신 #긴장감`,
  slide: slide({ n: 14, kind: 'skill', tag: `${E('1f47b')} 스킬`, title: '은신한 적이<br>가까우면 <span class="red">!</span>',
    visual: cv('a', 940, 330),
    desc: `은신 중엔 남에게 <b>배경과 똑같이</b> 보이고 미니맵에서도 빠져요<br>은신한 적이 화면에 들어오면 내 원 위에 <b class="red">빨간 !</b> · 20레벨부터`,
    script: scene('a', `{w:940,h:330,actors:{1:{x:260,y:180,r:72,level:10,me:true},2:{x:700,y:150,r:66,level:6,bg:'#4f8cff'}},events:[[0,{id:'stealth',e:2,ms:5000}]],at:1100,extra:(ctx)=>{ctx.save();ctx.fillStyle='#ff4d4d';ctx.beginPath();ctx.arc(330,95,30,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='900 44px "Noto Sans KR"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',330,97);ctx.restore();${hi()}ctx.font='700 26px "Noto Sans KR"';ctx.strokeText('…어디 있지?',700,270);ctx.fillStyle='#9fb0c6';ctx.fillText('…어디 있지?',700,270);ctx.restore();}}`) }) });

feeds.push({ post: '2026-11-20', file: '24h', caption: `키워드는 24시간 뒤 사라져요 ⏰

+한 키워드는 하루가 지나면 보관함에서 자동으로 빠지고, 그만큼 원이 작아져요.
그래서 매일 새 유행을 찾아야 크기를 지켜요. 같은 키워드는 한 번만 +할 수 있어요.

부딪혀서 잃은 키워드는 바로 다시 +할 수 있어요(24시간도 새로 시작).
보관함은 남은 시간순으로 정렬돼서 곧 사라질 키워드가 아래에 보여요.

${CTA}

${CREDIT}
${TAGS} #규칙 #24시간 #데일리`,
  slide: slide({ n: 15, kind: 'rule', tag: `${E('23f0')} 핵심 규칙`, title: '키워드는<br><span class="amber">24시간 뒤 사라져요</span>',
    visual: `<div style="width:900px;display:flex;flex-direction:column;gap:12px">${[['두쫀쿠', E('1f525'), '38점', '23시간 12분 남음', '#fff'], ['수능 샤프', E('1f525'), '19점', '9시간 40분 남음', '#fff'], ['첫눈', E('1f4a4'), '0점', '41분 남음', '#ffd166']].map(([k, s, p, t, c]) => `<div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:18px 28px"><div style="display:flex;align-items:center;gap:14px;font-weight:900;font-size:32px"><span>${s}</span>${k}<span class="muted" style="font-weight:700;font-size:26px">${p}</span></div><div style="font-weight:700;font-size:26px;color:${c}">${t}</div></div>`).join('')}</div>`,
    desc: `매일 새 유행을 찾아 <b>+</b>해야 크기를 지켜요 · 같은 키워드는 <b>한 번만</b><br>잃은 키워드는 바로 다시 <b>+</b>할 수 있어요` }) });

feeds.push({ post: '2026-11-19', file: 'score', caption: `인기 키워드 하나 > 흔한 키워드 여럿 📊

키워드 점수는 그 나라에서 "가진 사람의 비율"로 정해져요(3~50점).
1%가 가진 키워드는 5점, 10%면 19점, 50% 이상이면 50점.
그래서 남들이 아직 모르는 걸 먼저 +하고, 사람들이 몰려오면 내 원도 같이 커져요.

50%를 넘으면 더 안 올라요. 모두가 같은 키워드로 몰려가는 건 소용없어요.

${CTA}

${CREDIT}
${TAGS} #규칙 #점수 #유행도 #전략`,
  slide: slide({ n: 16, kind: 'rule', tag: `${E('1f4ca')} 핵심 규칙`, title: '인기 키워드 하나 ><br><span class="em">흔한 키워드 여럿</span>', compact: true,
    visual: cv('c', 900, 360),
    desc: `점수는 그 나라에서 <b>가진 사람의 비율</b>로 정해져요 (3~50점)<br>먼저 +하고 사람들이 몰려오면 <b>내 원도 같이 커져요</b>`,
    script: `const c=document.getElementById('c');c.width=1800;c.height=720;const ctx=c.getContext('2d');ctx.scale(2,2);
const rows=[['1%',5],['5%',12],['10%',19],['20%',30],['30%',38],['50%+',50]];const bx=130,bw=640,rh=52;
rows.forEach(([l,v],i)=>{const y=20+i*rh;ctx.fillStyle='#9fb0c6';ctx.font='900 26px "Noto Sans KR"';ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillText(l,bx-18,y+20);
 ctx.fillStyle='#1b2433';ctx.beginPath();ctx.roundRect(bx,y,bw,40,12);ctx.fill();const g=ctx.createLinearGradient(bx,0,bx+bw,0);g.addColorStop(0,'#3fb68b');g.addColorStop(1,'#7ee0b8');ctx.fillStyle=i===5?'#ffd166':g;ctx.beginPath();ctx.roundRect(bx,y,bw*v/50,40,12);ctx.fill();
 ctx.fillStyle=i===5?'#0b0f17':'#fff';ctx.textAlign='left';ctx.font='900 28px "Noto Sans KR"';ctx.fillText(v+'점',bx+bw*v/50+(i===5?-90:14),y+20);});
ctx.fillStyle='#7f90a8';ctx.font='700 22px "Noto Sans KR"';ctx.textAlign='center';ctx.fillText('가진 사람 비율 → 키워드 점수',450,348);` }) });

feeds.push({ post: '2026-11-18', file: 'new-keyword', caption: `검색에 없는 신조어도 + 할 수 있어요 💤→🔥

아직 아무도 모르는 밈이나 신조어를 검색하면 💤 카드가 떠요. 그래도 +할 수 있어요.
그 키워드를 가진 사람이 3명이 되거나 외부에서 뜨기 시작하면 그 순간 🔥 활성이 되고, 먼저 +한 사람부터 점수를 받아요.

"이거 내가 제일 먼저 알았는데"를 증명하는 방법이에요.

${CTA}

${CREDIT}
${TAGS} #신조어 #밈 #먼저알았다 #트렌드`,
  slide: slide({ n: 17, kind: 'rule', tag: `${E('1f4a4')} 핵심 규칙`, title: '검색에 없는 신조어도<br><span class="em">+ 할 수 있어요</span>',
    visual: `<div style="display:flex;align-items:center;gap:26px"><div class="card" style="padding:22px 30px;text-align:left;width:300px"><div style="font-size:24px;color:var(--muted)">${E('1f4a4')} 비활성 · 0점</div><div style="font-weight:900;font-size:40px;margin-top:6px">두쫀쿠</div><div style="margin-top:10px;display:inline-block;padding:6px 18px;border-radius:10px;background:var(--accent);color:#0b0f17;font-weight:900;font-size:24px">+ 추가</div></div><div style="text-align:center"><div style="font-weight:900;font-size:36px">${E('1f465')} 3명</div><div style="font-size:52px;color:var(--mint);line-height:1">→</div></div><div class="card" style="padding:22px 30px;text-align:left;width:300px;border-color:rgba(255,140,40,.6)"><div style="font-size:24px;color:#ffb067">${E('1f525')} 활성 · 25점</div><div style="font-weight:900;font-size:40px;margin-top:6px">두쫀쿠</div><div style="margin-top:10px;font-size:24px;color:var(--muted)">먼저 +한 사람부터 점수</div></div></div>`,
    desc: `가진 사람이 <b>3명</b>이 되거나 밖에서 뜨기 시작하면 바로 ${E('1f525')} 활성<br>"이거 내가 먼저 알았는데"를 증명하는 방법` }) });

feeds.push({ post: '2026-11-17', file: 'death', caption: `죽어도 칭호를 줘요 💀

키워드가 하나도 없는 채로 지거나 체력이 0%가 되면 패배예요.
화면이 흑백이 되고 [리스폰]을 누르면 가운데 세이프존에서 다시 시작. 레벨·EXP는 그대로예요.

그리고 패배 횟수로 칭호가 열려요.
첫 패배 → 칠전팔기(10) → 백전노장(50) → 불사조(200) → 끝없는 도전자(1,000)
지는 걸 놀리지 않고 다시 일어서는 걸 칭찬하는 이름이에요.

${CTA}

${CREDIT}
${TAGS} #칭호 #리스폰 #불사조 #칠전팔기`,
  slide: slide({ n: 18, kind: 'fun', tag: `${E('1f480')} 죽음과 리스폰`, title: '죽어도<br><span class="amber">칭호를 줘요</span>',
    visual: `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:14px;max-width:900px"><span class="chip">${E('1f3c5')} 첫 패배 · 1</span><span class="chip">${E('1f3c5')} 칠전팔기 · 10</span><span class="chip">${E('1f3c5')} 백전노장 · 50</span><span class="chip">${E('1f3c5')} 불사조 · 200</span><span class="chip">${E('1f3c5')} 끝없는 도전자 · 1,000</span></div>`,
    desc: `키워드 없이 지거나 체력이 <b>0%</b>면 패배 → 화면이 흑백 → <b>[리스폰]</b><br>가운데 세이프존에서 다시 시작 · 레벨·EXP는 그대로` }) });

feeds.push({ post: '2026-11-16', file: 'titles', caption: `칭호 74개, 몇 개 모았어요? 🏅

추가수·레벨·보유 키워드·유행도·순위·댓글·검색·빼앗기·봇·구슬·잃기·처치·패배·콤보·불꽃 끄기·보스… 조건을 채우면 자동으로 받아요.
한 번 받은 칭호는 안 사라지고, 하나를 골라 닉네임 아래에 달 수 있어요.
칭호함에서 아직 못 받은 칭호의 조건과 진행률도 보여요.

지금 단 칭호, 댓글로 자랑해 주세요 👇

${CTA}

${CREDIT}
${TAGS} #칭호 #수집 #업적`,
  slide: slide({ n: 19, kind: 'fun', tag: `${E('1f3c5')} 칭호`, title: '칭호 74개,<br><span class="amber">몇 개 모았어요?</span>', compact: true,
    visual: `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:940px">${['트렌드 워처', '완전체', '떠오르는 별', '정상', '첫 승리', '봇 사냥꾼', '구슬 마니아', '오뚝이', '터줏대감', '저승사자', '불꽃 점화', '소방관', '100 콤보', '보스 슬레이어', '키워드 제왕', '레전드'].map((t, i) => `<span class="chip" style="${i % 5 === 4 ? 'background:rgba(169,139,255,.14);border-color:rgba(169,139,255,.5);color:#d3c4ff' : ''}">${t}</span>`).join('')}<span class="chip" style="background:rgba(255,255,255,.06);border-color:#3a475c;color:#9fb0c6">+ 58개 더</span></div>`,
    desc: `조건을 채우면 <b>자동 지급</b>, 한 번 받으면 안 사라져요<br>하나를 골라 닉네임 아래에 · 칭호함에서 진행률 확인` }) });

feeds.push({ post: '2026-11-15', file: 'customize', caption: `10레벨부터, 꾸미기 🎨

바탕색·테두리 24색 + 직접 고르기, 테두리 효과 5가지(빛·점선·그라데이션·맥박·무지개), 이름표 모양.
원 안에는 거북이 대신 32×32 픽셀 그림을 직접 그려 넣을 수 있어요(왼쪽이 앞, 가는 방향을 바라봐요).
움직일 때 남는 이동 효과는 16가지 — 불꽃·무지개·별가루·하트·눈송이·발자국(거북이·고양이·새·곰·토끼)…

프로필 3칸에 저장해 두고 바꿔 끼워요.

${CTA}

${CREDIT}
${TAGS} #꾸미기 #픽셀아트 #커스터마이징 #내원키우기`,
  slide: slide({ n: 20, kind: 'fun', tag: `${E('1f3a8')} 꾸미기`, title: '10레벨부터,<br><span style="color:#ff9ab0">꾸미기</span>', compact: true,
    visual: cv('c', 940, 300),
    desc: `바탕·테두리 <b>24색</b> · 테두리 효과 5 · <b>32×32 픽셀 그림</b><br>이동 효과 <b>16가지</b> · 프로필 3칸에 저장해 두고 바꿔 끼워요`,
    script: `const c=document.getElementById('c');c.width=1880;c.height=600;const ctx=c.getContext('2d');ctx.scale(2,2);
// 이동 효과(하트·별)가 분홍 원 뒤에 남는 모습
['❤','✨','❤','✨','❤'].forEach((e,i)=>{ctx.font='900 '+(30-i*4)+'px "Noto Sans KR"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.globalAlpha=1-i*.17;ctx.fillText(e,96-i*24,150+(i%2?-30:30));});ctx.globalAlpha=1;
L.orb(ctx,190,150,80,{level:10,bg:'#ec407a',border:'#fff',lw:8,name:'분홍이',nameSize:24});
L.orb(ctx,400,150,80,{level:10,bg:'#4f8cff',border:'#ffd166',lw:12,name:'노란테',nameSize:24});
ctx.save();ctx.setLineDash([14,10]);ctx.strokeStyle='#7cd3ff';ctx.lineWidth=6;ctx.beginPath();ctx.arc(610,150,96,0,Math.PI*2);ctx.stroke();ctx.restore();L.orb(ctx,610,150,80,{level:10,bg:'#26c6da',name:'점선',nameSize:24});
// 픽셀 그림 원
const ox=830;ctx.save();ctx.beginPath();ctx.arc(ox,150,80,0,Math.PI*2);ctx.clip();ctx.fillStyle='#ffca28';ctx.fillRect(ox-80,70,160,160);const px=[[3,2],[4,2],[5,2],[2,3],[6,3],[2,4],[6,4],[1,5],[7,5],[2,6],[6,6],[3,7],[4,7],[5,7],[3,4],[5,4]];ctx.fillStyle='#0b0f17';px.forEach(([x,y])=>ctx.fillRect(ox-80+x*18,70+y*18,18,18));ctx.restore();ctx.strokeStyle='#11372a';ctx.lineWidth=7;ctx.beginPath();ctx.arc(ox,150,80,0,Math.PI*2);ctx.stroke();
${hi()}ctx.font='900 24px "Noto Sans KR"';ctx.textBaseline='top';ctx.strokeText('픽셀 그림',ox,240);ctx.fillStyle='#fff';ctx.fillText('픽셀 그림',ox,240);ctx.restore();` }) });

feeds.push({ post: '2026-11-14', file: 'share-card', caption: `내 성적표, 카톡으로 자랑 📸

내 정보 → [📸 자랑하기 카드]를 누르면 내 원·레벨·칭호·유행도·7일 그래프·🔥 키워드 TOP 3·기록이 담긴 카드가 만들어져요.
[💬 카카오톡 공유]를 누르면 바로 카톡으로, [⬇️ 이미지 저장]으로 인스타에.
링크를 붙여 넣기만 해도 카톡·디스코드·X에서 카드가 보여요.

"내 카드를 지금까지 N명이 봤고 M명이 게임에 들어왔어요"도 세 줘요.
#내원키우기 로 올려 주시면 계정에서 소개해 드릴게요.

${CTA}

${CREDIT}
${TAGS} #자랑하기 #공유 #내원키우기 #카카오톡`,
  slide: slide({ n: 21, kind: 'fun', tag: `${E('1f4f8')} 자랑하기 카드`, title: '내 성적표,<br><span class="amber">카톡으로 자랑</span>', compact: true,
    visual: `<div class="card" style="width:420px;padding:22px 26px;text-align:left;position:relative"><div style="font-size:20px;color:var(--muted);font-weight:700">내 트렌드 성적표</div><div style="display:flex;align-items:center;gap:16px;margin-top:10px">${cv('c', 96, 96)}<div><div style="font-weight:900;font-size:30px">민수</div><div style="font-size:20px;color:var(--amber);font-weight:900">불꽃 점화 · Lv.27</div></div></div><div style="margin-top:14px;font-weight:900;font-size:40px">유행도 <span class="em">842</span> <span style="font-size:22px;color:#ffd166">· 3위</span></div><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${['두쫀쿠 38', '수능 샤프 19', '첫눈 12'].map((k) => `<span style="padding:4px 12px;border-radius:999px;background:rgba(255,140,40,.15);border:1px solid rgba(255,140,40,.5);font-size:18px;font-weight:700">${E('1f525')} ${k}</span>`).join('')}</div><div style="margin-top:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:16px;color:var(--muted);text-align:center">${[['12', '보유'], ['341', '추가수'], ['27', '처치'], ['19', '활동일']].map(([v, k]) => `<div><div style="font-weight:900;font-size:24px;color:#fff">${v}</div>${k}</div>`).join('')}</div></div><div style="margin-left:26px;display:flex;flex-direction:column;gap:12px;text-align:left"><div style="padding:14px 24px;border-radius:14px;background:#fee500;color:#191919;font-weight:900;font-size:26px">${E('1f4ac')} 카카오톡 공유</div><div style="padding:14px 24px;border-radius:14px;background:#1b2433;border:1.5px solid #3a475c;font-weight:900;font-size:26px">${E('2b07')} 이미지 저장</div><div style="padding:14px 24px;border-radius:14px;background:#1b2433;border:1.5px solid #3a475c;font-weight:900;font-size:26px">${E('1f517')} 링크 복사</div></div>`,
    desc: `링크만 붙여도 <b>카톡·디스코드·X</b>에 카드가 보여요<br>내 정보 → ${E('1f4f8')} 자랑하기 카드 · <b>#내원키우기</b> 로 올리면 소개해요`,
    script: `const c=document.getElementById('c');c.width=192;c.height=192;const ctx=c.getContext('2d');ctx.scale(2,2);L.orb(ctx,48,48,44,{level:10,bg:'#ec407a',lw:5});` }) });

feeds.push({ post: '2026-11-13', file: 'mobile', note: '18:00 첫 게시물', caption: `폰에서도 설치 없이 📱

주소만 열면 바로 시작. 시작하면 전체 화면이 되고 화면을 누르고 끌면 조이스틱으로 움직여요.
가로 모드도 지원해요. 스킬·대시 버튼은 오른쪽 아래, 체력은 스킬 줄 바로 아래.
홈 화면에 추가하면 앱처럼 주소창 없이 열려요.

점심시간, 퇴근길에 한 판.

${CTA}

${CREDIT}
${TAGS} #모바일 #웹게임 #설치없이 #심심할때`,
  slide: slide({ n: 23, kind: 'fix', tag: `${E('1f4f1')} 모바일`, title: '폰에서도<br><span class="em">설치 없이</span>',
    visual: `<div style="position:relative;width:200px;height:400px;border-radius:34px;background:#0b0f17;border:5px solid #3a475c;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)"><div style="position:absolute;inset:0;background:linear-gradient(180deg,#26395a,#1c2c47)"></div><div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.09) 1px,transparent 1px);background-size:24px 24px"></div><canvas id="c" style="position:relative;width:190px;height:390px"></canvas><div style="position:absolute;left:18px;bottom:22px;width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.35)"><div style="position:absolute;left:28px;top:14px;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.7)"></div></div><div style="position:absolute;right:14px;bottom:22px;display:flex;gap:6px">${['1fa9d', '1f6e1', '26a1'].map((cp) => `<div style="width:34px;height:34px;border-radius:10px;background:rgba(27,36,51,.9);border:1.5px solid #3a475c;display:grid;place-items:center;font-size:18px">${E(cp)}</div>`).join('')}</div><div style="position:absolute;left:14px;right:14px;top:14px;height:8px;border-radius:999px;background:#2a1620"><div style="width:76%;height:100%;border-radius:999px;background:#ff6b6b"></div></div></div><div style="margin-left:40px;text-align:left;font-size:30px;line-height:1.7;font-weight:700"><div>${E('1f446')} 누르고 끌면 <b class="em">조이스틱</b></div><div>${E('1f4f1')} 시작하면 <b class="em">전체 화면</b></div><div>${E('1f504')} <b class="em">가로 모드</b> 지원</div><div>${E('1f3e0')} 홈 화면에 추가 OK</div></div>`,
    desc: `주소만 열면 바로 시작 · 점심시간, 퇴근길에 한 판`,
    script: `const c=document.getElementById('c');c.width=380;c.height=780;const ctx=c.getContext('2d');ctx.scale(2,2);L.orb(ctx,95,180,34,{level:10,me:true,lw:4});L.orb(ctx,150,110,22,{level:3,bg:'#e53935',lw:3});L.orb(ctx,40,250,18,{level:5,bg:'#4f8cff',lw:3});` }) });

/* ============ 만들기 ============ */
// 파일 이름 = 게시일-내용(예: 2026-11-13-mobile.png). 날짜가 없으면 '미정-내용'. feeds.md도 게시일 순이다
feeds.sort((a, b) => (a.post ?? '9999').localeCompare(b.post ?? '9999'));
const name = (f) => `${f.post ?? '미정'}-${f.file}`;
await render(feeds.map((f) => ({ out: path.join(OUT, name(f) + '.png'), slide: f.slide })));

const md = [`# 패치노트 피드 ${feeds.length}개 (사진 1장 + 캡션)

> 이 파일은 \`_src/patch.mjs\`가 만든다. 문구를 고치려면 그 파일을 고치고 \`npm run build:patch\`를 다시 실행한다(이미지와 캡션이 같이 바뀐다).
> 이미지 1080×1350(4:5) · QR은 \`utm_campaign=patch\`
> 파일 이름과 제목 앞의 날짜가 인스타그램 예약 게시일이다(\`post\` 값). 날짜를 바꾸면 \`patch.mjs\`의 그 피드에서 \`post\`를 고치고 다시 만든다(파일 이름도 같이 바뀌니 옛 PNG는 지운다).

## 예약 현황

| 게시일 | 피드 | 메모 |
|---|---|---|
${feeds.map((f) => `| ${f.post ?? '미정'} | ${f.file} | ${f.note ?? ''} |`).join('\n')}
`];
for (const f of feeds) md.push(`---\n\n## ${f.post ?? '미정'} · ${f.file}${f.note ? ` (${f.note})` : ''}\n\n![${name(f)}](${name(f)}.png)\n\n**캡션(복사해서 사용)**\n\`\`\`\n${f.caption}\n${TAGS_EN}\n\`\`\`\n`);
fs.writeFileSync(path.join(OUT, 'feeds.md'), md.join('\n'));
console.log('wrote patch-notes/feeds.md');
