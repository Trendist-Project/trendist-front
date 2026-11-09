import { render, E, QR, ROOT } from './build.mjs';
const N = 7, D = ROOT + '/feed1-launch/';
const s = [];

// 1. 표지
s.push({ out: D + '01-cover.png', slide: { page: 1, pages: N, foot: '유행 감각 배틀 · 브라우저 게임', body: `
<div class="content" style="top:176px">
  <div class="pill" style="margin-bottom:34px">${E('1f525')} 내 촉을 증명하는 게임</div>
  <h1 style="font-size:132px">유행,<br>누가 먼저<br><span class="em">알았을까?</span></h1>
</div>
<canvas id="c" width="1080" height="500" style="position:absolute;left:0;bottom:90px;width:1080px;height:500px"></canvas>`,
script: `
const c=document.getElementById('c'),ctx=c.getContext('2d');
const g=ctx.createLinearGradient(0,0,0,500);g.addColorStop(0,'rgba(38,57,90,0)');g.addColorStop(.3,'#26395a');g.addColorStop(1,'#1c2c47');ctx.fillStyle=g;ctx.fillRect(0,0,1080,500);
ctx.strokeStyle='rgba(255,255,255,0.09)';ctx.lineWidth=1.5;for(let x=0;x<=1080;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,500);ctx.stroke();}for(let y=500;y>=0;y-=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1080,y);ctx.stroke();}
L.orb(ctx,150,330,42,{level:1,name:'나',nameSize:26});
L.orb(ctx,390,290,86,{level:5,bg:'#4f8cff',name:'먼저 찾은 사람',nameSize:26});
L.orb(ctx,800,240,170,{level:10,bg:'#3fb68b',name:'유행을 아는 자',me:true,nameSize:30,glow:'rgba(126,224,184,.55)'});
ctx.save();ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=5;ctx.setLineDash([2,14]);ctx.lineCap='round';
ctx.beginPath();ctx.moveTo(210,300);ctx.bezierCurveTo(250,240,280,230,300,230);ctx.stroke();ctx.beginPath();ctx.moveTo(500,250);ctx.bezierCurveTo(550,210,570,200,590,196);ctx.stroke();ctx.restore();
` } });

// 2. 문제: 유행이 짧아진다
const bar = (name, days, pct, color, y) => `<div style="margin-bottom:24px"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><span style="font-weight:900;font-size:40px">${name}</span><span style="font-weight:900;font-size:54px;color:${color}">${days}<span style="font-size:32px">일</span></span></div><div style="height:38px;border-radius:19px;background:rgba(255,255,255,.07);overflow:hidden"><div style="width:${pct}%;height:100%;border-radius:23px;background:linear-gradient(90deg,${color},${color}aa)"></div></div></div>`;
s.push({ out: D + '02-problem.png', slide: { page: 2, pages: N, foot: '출처: 위키트리(2026.7.25)', body: `
<div class="content" style="top:170px">
  <div class="pill" style="margin-bottom:30px;background:rgba(255,107,107,.14);border-color:rgba(255,107,107,.5);color:#ff9a9a">${E('23f1')} 유행의 수명</div>
  <h1 style="font-size:92px">유행은 점점<br><span class="red">짧아집니다</span></h1>
  <div style="margin-top:48px">
    ${bar('탕후루', 54, 100, '#ffd166')}
    ${bar('두바이 초콜릿', 13, 24, '#ff9f5a')}
    ${bar('두쫀쿠', 17, 31, '#ff6b6b')}
  </div>
  <div class="card" style="margin-top:30px;padding:28px 38px;font-size:40px;font-weight:700;line-height:1.4">5년 사이 유행의 수명이 <span class="amber" style="font-weight:900">약 10분의 1</span>로.<br>그래서 이제 중요한 건 <span class="em" style="font-weight:900">“누가 먼저 알았나”</span></div>
</div>` } });

// 3. 해결: 어떻게 하는 게임인가
const step = (n, title, desc, vis) => `<div class="card" style="display:grid;grid-template-columns:96px 1fr;gap:26px;align-items:center;padding:22px 32px;margin-bottom:20px">
  <div style="width:76px;height:76px;border-radius:50%;background:linear-gradient(135deg,#3fb68b,#2a8a66);display:grid;place-items:center;font-weight:900;font-size:42px">${n}</div>
  <div><div style="font-weight:900;font-size:44px;letter-spacing:-.02em">${title}</div><div style="font-size:28px;color:var(--muted);margin-top:4px;line-height:1.3">${desc}</div>${vis || ''}</div></div>`;
s.push({ out: D + '03-how.png', slide: { page: 3, pages: N, foot: '화면은 이해를 돕는 예시입니다', body: `
<div class="content" style="top:150px">
  <div class="pill" style="margin-bottom:18px">${E('1f3af')} 이렇게 놀아요</div>
  <h1 style="font-size:80px;margin-bottom:22px">찾고, <span class="em">+</span> 하면<br>내 원이 <span class="em">커져요</span></h1>
  ${step(1, '뜨는 키워드를 찾아요', '검색창에 요즘 뜨는 단어를 입력',
    `<div style="margin-top:18px;display:flex;gap:12px"><div style="flex:1;border-radius:16px;background:#0b0f17;border:1.5px solid #2a3548;padding:10px 22px;font-size:30px;font-weight:700">${E('1f50d')} 두쫀쿠</div><div style="border-radius:16px;background:var(--accent);color:#06241a;font-weight:900;font-size:30px;padding:10px 26px">검색</div></div>`)}
  ${step(2, '먼저 + 추가해요', '남들보다 먼저 보관함에 담기',
    `<div style="margin-top:18px;display:flex;align-items:center;gap:14px;border-radius:16px;background:#0b0f17;border:1.5px solid #2a3548;padding:10px 22px"><span style="font-weight:900;font-size:32px">두쫀쿠</span><span class="pill" style="font-size:22px;padding:4px 14px">${E('1f525')} 활성</span><span style="margin-left:auto;border-radius:14px;background:var(--accent);color:#06241a;font-weight:900;font-size:30px;padding:6px 22px">+ 추가</span></div>`)}
  ${step(3, '내 원이 커져요', '많이 가질수록, 일찍 찾을수록 커져요',
    `<canvas id="g" width="640" height="130" style="margin-top:10px;width:640px;height:130px"></canvas>`)}
</div>`,
script: `
const c=document.getElementById('g'),ctx=c.getContext('2d');
[[50,18,'#3fb68b',1],[160,30,'#3fb68b',3],[300,46,'#3fb68b',6],[490,60,'#3fb68b',10]].forEach(([x,r,bg,lv],i)=>{L.orb(ctx,x,66,r,{level:lv,bg});});
ctx.save();ctx.fillStyle='rgba(255,255,255,.5)';ctx.font='900 40px "Noto Sans KR"';ctx.textBaseline='middle';
[[100,'›'],[225,'›'],[400,'›']].forEach(([x,t])=>ctx.fillText(t,x,62));ctx.restore();
` } });

// 4. 대결
s.push({ out: D + '04-battle.png', slide: { page: 4, pages: N, foot: '큰 원이 작은 원을 밀어내요', body: `
<div class="content" style="top:170px">
  <div class="pill" style="margin-bottom:30px;background:rgba(255,209,102,.14);border-color:rgba(255,209,102,.5);color:var(--amber)">${E('1f4a5')} 부딪히면 승부</div>
  <h1 style="font-size:96px">커지면<br><span class="amber">부딪힐 때 이겨요</span></h1>
</div>
<canvas id="c" width="1080" height="500" style="position:absolute;left:0;top:520px;width:1080px;height:500px"></canvas>
<div class="content" style="top:1050px;display:grid;grid-template-columns:1fr 1fr;gap:20px">
  <div class="card" style="padding:22px 28px;font-size:30px;font-weight:700;line-height:1.35"><span class="em" style="font-weight:900">유행도가 높은 쪽</span>이<br>키워드를 가져가요</div>
  <div class="card" style="padding:22px 28px;font-size:30px;font-weight:700;line-height:1.35"><span class="red" style="font-weight:900">낮은 쪽</span>은 키워드<br>1개를 잃어요</div>
</div>`,
script: `
const c=document.getElementById('c'),ctx=c.getContext('2d');L.arenaBg(ctx,1080,500,60);
L.orb(ctx,330,240,160,{level:10,name:'유행을 아는 자',me:true,glow:'rgba(126,224,184,.5)'});
L.orb(ctx,800,250,74,{level:4,bg:'#4f8cff',name:'뒤늦은 사람',nameSize:26});
ctx.save();ctx.strokeStyle='#ffd166';ctx.fillStyle='#ffd166';ctx.lineWidth=12;ctx.lineCap='round';
ctx.beginPath();ctx.moveTo(515,250);ctx.lineTo(680,250);ctx.stroke();ctx.beginPath();ctx.moveTo(698,250);ctx.lineTo(664,224);ctx.lineTo(664,276);ctx.closePath();ctx.fill();
ctx.restore();
ctx.save();ctx.font='900 44px "Noto Sans KR"';ctx.textAlign='center';ctx.lineWidth=10;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.lineJoin='round';
ctx.strokeText('키워드 -1',860,150);ctx.fillStyle='#ff8a8a';ctx.fillText('키워드 -1',860,150);ctx.restore();
` } });

// 5. 스킬
const sk = [['26a1', '대시', '순간 2배 속도로 질주', '#7fdbff'], ['1f6e1', '방패', '잠깐 다 통과해요', '#4ade80'], ['1fa9d', '갈고리', '끌어와서 키워드 뺏기', '#ff6b8a'], ['1f4a5', '충격파', '주변을 밀어내요', '#ff8a8a'],
  ['1f47b', '은신', '배경처럼 사라져요', '#b9a8ff'], ['1f576', '암흑', '상대 시야를 가려요', '#c9b8ff'], ['2620', '독', '키워드가 줄줄 새요', '#5fe08a'], ['2728', '정화', '방해를 한 번에 해제', '#7cd3ff']];
s.push({ out: D + '05-skills.png', slide: { page: 5, pages: N, foot: '레벨이 오르면 하나씩 열려요', body: `
<div class="content" style="top:168px">
  <div class="pill" style="margin-bottom:30px;background:rgba(169,139,255,.15);border-color:rgba(169,139,255,.5);color:var(--violet)">${E('26a1')} 스킬 8종</div>
  <h1 style="font-size:96px;margin-bottom:44px">스킬로<br><span style="color:var(--violet)">판을 뒤집어요</span></h1>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
  ${sk.map(([cp, n, d, col]) => `<div class="card" style="display:flex;align-items:center;gap:22px;padding:24px 26px;border-color:${col}55"><div style="width:84px;height:84px;border-radius:22px;background:${col}55;border:2px solid ${col}aa;display:grid;place-items:center;font-size:48px;flex:none">${E(cp)}</div><div><div style="font-weight:900;font-size:44px">${n}</div><div style="font-size:27px;color:var(--muted);margin-top:2px;line-height:1.25">${d}</div></div></div>`).join('')}
  </div>
</div>` } });

// 6. 거북이
s.push({ out: D + '06-turtle.png', slide: { page: 6, pages: N, foot: '레벨 1 ~ 100', body: `
<div class="content" style="top:168px">
  <div class="pill" style="margin-bottom:30px">${E('1f422')} 성장 요소</div>
  <h1 style="font-size:96px">레벨이 오르면<br><span class="em">거북이가 자라요</span></h1>
</div>
<canvas id="c" width="1080" height="500" style="position:absolute;left:0;top:520px;width:1080px;height:500px"></canvas>
<div class="content" style="top:1040px"><div class="card" style="padding:26px 34px;font-size:34px;font-weight:700;line-height:1.4">1레벨은 동그라미 하나, <span class="em" style="font-weight:900">10레벨</span>에 완성!<br><span class="muted" style="font-size:30px;font-weight:500">11레벨부터는 구간마다 색이 바뀌고, 100레벨은 무지개예요</span></div></div>`,
script: `
const c=document.getElementById('c'),ctx=c.getContext('2d');
for(let i=0;i<10;i++){const col=i%5,row=Math.floor(i/5);const x=116+col*212,y=110+row*240;L.orb(ctx,x,y,84,{level:i+1,border:'#11372a',name:'Lv.'+(i+1),nameSize:30});}
` } });

// 7. CTA
s.push({ out: D + '07-cta.png', slide: { page: 7, pages: N, foot: '프로필 링크에서 바로 입장!', swipe: false, body: `
<div class="content" style="top:170px;text-align:center">
  <div class="pill" style="margin-bottom:34px">${E('1f680')} 지금 바로</div>
  <h1 style="font-size:112px">내 촉,<br><span class="em">확인하러 와요</span></h1>
  <div style="display:flex;justify-content:center;gap:16px;margin-top:46px;flex-wrap:wrap">
    <span class="pill" style="font-size:32px">설치 없이</span><span class="pill" style="font-size:32px">가입 없이</span><span class="pill" style="font-size:32px">바로 시작</span>
  </div>
  <div style="margin:60px auto 0;display:flex;align-items:center;justify-content:center;gap:48px">
    <div style="width:330px;height:330px;border-radius:36px;background:#fff;padding:26px;box-shadow:0 20px 60px rgba(63,182,139,.35)">${QR.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>
    <div style="text-align:left"><div style="font-size:30px;color:var(--muted);font-weight:700">PC · 모바일 모두</div><div style="font-weight:900;font-size:76px;letter-spacing:-.02em;margin-top:10px">trendist<span class="em">.kr</span></div><div style="margin-top:16px;font-size:30px;color:var(--muted);line-height:1.45">QR을 찍거나<br>프로필 링크를 눌러요</div></div>
  </div>
  <div style="margin-top:58px;font-size:40px;font-weight:900;color:var(--amber)">${E('1f4ac')} 유행을 먼저 알았던 경험, 댓글로 자랑해 주세요</div>
</div>` } });

await render(s);
