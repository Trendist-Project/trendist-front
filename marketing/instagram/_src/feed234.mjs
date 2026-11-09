import { render, E, QR, ROOT } from './build.mjs';
const s = [];

/* ============ 피드 2: 거북이 성장 (4장) ============ */
const D2 = ROOT + '/feed2-turtle/', N2 = 4;
s.push({ out: D2 + '01-cover.png', slide: { page: 1, pages: N2, foot: '레벨 1 → 100', body: `
<div class="content" style="top:170px">
  <div class="pill" style="margin-bottom:34px">${E('1f422')} 거북이 성장 일기</div>
  <h1 style="font-size:120px">내 거북이,<br><span class="em">얼마나 컸을까?</span></h1>
</div>
<canvas id="c" width="1080" height="640" style="position:absolute;left:0;top:560px;width:1080px;height:640px"></canvas>`,
script: `
const c=document.getElementById('c'),ctx=c.getContext('2d');
const g=ctx.createRadialGradient(540,330,40,540,330,420);g.addColorStop(0,'rgba(126,224,184,.35)');g.addColorStop(1,'rgba(126,224,184,0)');ctx.fillStyle=g;ctx.fillRect(0,0,1080,640);
L.orb(ctx,540,320,270,{level:10,glow:'rgba(126,224,184,.5)',lw:18});
L.orb(ctx,130,470,64,{level:1,name:'Lv.1',nameSize:30});
L.orb(ctx,950,400,86,{level:5,name:'Lv.5',nameSize:30});
ctx.save();ctx.font='900 56px "Noto Sans KR"';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.lineWidth=12;ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineJoin='round';
` } });
const parts = ['등껍질', '가운데 무늬', '바깥 무늬', '머리', '눈', '앞발', '뒷발·꼬리', '웃는 입', '반짝 광택'];
s.push({ out: D2 + '02-growth.png', slide: { page: 2, pages: N2, foot: 'Lv.10에 완성!', body: `
<div class="content" style="top:168px">
  <div class="pill" style="margin-bottom:30px">${E('2b06')} 한 레벨, 한 부위</div>
  <h1 style="font-size:96px">레벨 하나에<br><span class="em">부위가 하나씩</span></h1>
</div>
<canvas id="c" width="1080" height="740" style="position:absolute;left:0;top:480px;width:1080px;height:740px"></canvas>`,
script: `
const c=document.getElementById('c'),ctx=c.getContext('2d');
const parts=${JSON.stringify(parts)};
for(let i=0;i<9;i++){const col=i%3,row=Math.floor(i/3);const x=180+col*360,y=80+row*230;
  L.orb(ctx,x,y,66,{level:i+2});
  ctx.save();ctx.textAlign='center';ctx.textBaseline='top';ctx.font='900 34px "Noto Sans KR"';ctx.fillStyle='#fff';ctx.fillText('Lv.'+(i+2),x,y+76);
  ctx.font='700 28px "Noto Sans KR"';ctx.fillStyle='#9fb0c6';ctx.fillText(parts[i],x,y+116);ctx.restore();}
` } });
const bands = [['10대', '파랑', '#4f8cff'], ['20대', '청록', '#26c6da'], ['30대', '초록', '#66bb6a'], ['40대', '연두', '#d4e157'], ['50대', '노랑', '#ffca28'], ['60대', '주황', '#ff9800'], ['70대', '빨강', '#ef5350'], ['80대', '분홍', '#ec407a'], ['90대', '보라', '#ab47bc']];
s.push({ out: D2 + '03-colors.png', slide: { page: 3, pages: N2, foot: '11레벨부터 구간마다 색이 바뀌어요', body: `
<div class="content" style="top:168px">
  <div class="pill" style="margin-bottom:30px">${E('2728')} 11레벨부터</div>
  <h1 style="font-size:96px">구간마다<br><span class="em">색이 바뀌어요</span></h1>
</div>
<canvas id="c" width="1080" height="640" style="position:absolute;left:0;top:480px;width:1080px;height:640px"></canvas>
<div class="content" style="top:1112px"><div class="card" style="padding:22px 32px;font-size:30px;font-weight:700;line-height:1.4">같은 구간 안에서는 일의 자리가 클수록 <span class="em" style="font-weight:900">색이 진해져요</span></div></div>`,
script: `
const c=document.getElementById('c'),ctx=c.getContext('2d');
const bands=${JSON.stringify(bands)};
bands.forEach(([n,nm,col],i)=>{const cc=i%5,rr=Math.floor(i/5);const x=118+cc*211,y=100+rr*290;L.orb(ctx,x,y,88,{level:10,bg:col});
  ctx.save();ctx.textAlign='center';ctx.textBaseline='top';ctx.font='900 32px "Noto Sans KR"';ctx.fillStyle='#fff';ctx.fillText(n,x,y+100);ctx.font='700 26px "Noto Sans KR"';ctx.fillStyle='#9fb0c6';ctx.fillText(nm,x,y+140);ctx.restore();});
const x=118+4*211,y=100+290;L.orb(ctx,x,y,88,{level:10,bg:'rainbow',glow:'rgba(255,255,255,.55)'});
ctx.save();ctx.textAlign='center';ctx.textBaseline='top';ctx.font='900 32px "Noto Sans KR"';ctx.fillStyle='#ffd166';ctx.fillText('100레벨',x,y+100);ctx.font='700 26px "Noto Sans KR"';ctx.fillStyle='#ffe29a';ctx.fillText('무지개!',x,y+140);ctx.restore();
// 여섯 번째 칸은 이어지는 화살표
` } });
s.push({ out: D2 + '04-cta.png', slide: { page: 4, pages: N2, foot: '#내원키우기', swipe: false, body: `
<div class="content" style="top:168px;text-align:center">
  <canvas id="c" width="420" height="420" style="margin:-10px auto 0;width:360px;height:360px"></canvas>
  <h1 style="font-size:96px">무지개 거북이<br><span class="em">노려볼래요?</span></h1>
  <div style="margin-top:24px;font-size:32px;color:var(--muted);line-height:1.45">‘자랑하기 카드’로 내 기록을 이미지로 만들어<br>인스타에 <span class="amber" style="font-weight:900">#내원키우기</span> 로 올려 주세요</div>
  <div style="margin:32px auto 0;display:flex;align-items:center;justify-content:center;gap:40px">
    <div style="width:230px;height:230px;border-radius:28px;background:#fff;padding:18px">${QR.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>
    <div style="text-align:left"><div style="font-weight:900;font-size:68px;letter-spacing:-.02em">trendist<span class="em">.kr</span></div><div style="margin-top:12px;font-size:30px;color:var(--muted)">설치 없이 · 가입 없이 · 바로 시작</div></div>
  </div>
</div>`,
script: `const c=document.getElementById('c'),ctx=c.getContext('2d');c.width=840;c.height=840;ctx.scale(2,2);
const g=ctx.createRadialGradient(210,210,20,210,210,210);g.addColorStop(0,'rgba(255,255,255,.28)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,420,420);
L.orb(ctx,210,210,150,{level:10,bg:'rainbow',glow:'rgba(255,255,255,.5)',lw:11});` } });

/* ============ 피드 3: 스킬 8종 (4장) ============ */
const D3 = ROOT + '/feed3-skills/', N3 = 4;
s.push({ out: D3 + '01-cover.png', slide: { page: 1, pages: N3, foot: '레벨이 오르면 하나씩 열려요', body: `
<div class="content" style="top:168px">
  <div class="pill" style="margin-bottom:30px;background:rgba(169,139,255,.15);border-color:rgba(169,139,255,.5);color:var(--violet)">${E('26a1')} 스킬 8종 한눈에</div>
  <h1 style="font-size:112px">알고 쓰면<br><span style="color:var(--violet)">판이 바뀝니다</span></h1>
</div>
<canvas id="c" style="position:absolute;left:0;top:640px"></canvas>`,
script: `
const c=document.getElementById('c');
L.fxScene(c,{w:1080,h:560,actors:{1:{x:210,y:330,r:84,level:10,me:true,glow:'rgba(126,224,184,.4)'},2:{x:650,y:350,r:62,level:5,bg:'#4f8cff'},3:{x:880,y:170,r:64,level:7,bg:'#ec407a'}},
 events:[[0,{id:'hook',e:1,dx:0.995,dy:0.1,range:470,ms:450}],[480,{id:'hookHit',e:1,t:2,ms:700}],[560,{id:'shockwave',e:3,x:880,y:170,r0:64,rMax:300,speed:480}],[300,{id:'poison',t:3,stacks:2,ms:9000}]],at:760,
 extra:(ctx)=>{ctx.save();ctx.font='900 44px "Noto Sans KR"';ctx.textAlign='center';ctx.lineWidth=10;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.lineJoin='round';ctx.strokeText('키워드 -1',560,262);ctx.fillStyle='#ff8a8a';ctx.fillText('키워드 -1',560,262);ctx.restore();}});
` } });
const skillPanel = (id, cp, name, desc, col) => `<div class="card" style="padding:18px 18px 22px;border-color:${col}66"><div style="display:flex;align-items:center;gap:14px;margin-bottom:12px"><div style="width:58px;height:58px;border-radius:16px;background:${col}55;border:2px solid ${col}aa;display:grid;place-items:center;font-size:34px">${E(cp)}</div><div style="font-weight:900;font-size:42px">${name}</div></div><canvas id="${id}" style="border-radius:18px;width:100%"></canvas><div style="margin-top:12px;font-size:26px;color:#c3cfdf;line-height:1.35;font-weight:500">${desc}</div></div>`;
const sceneJs = (id, cfg) => `L.fxScene(document.getElementById('${id}'),${cfg});`;
s.push({ out: D3 + '02-attack.png', slide: { page: 2, pages: N3, foot: '공격 스킬 4종', body: `
<div class="content" style="top:160px">
  <div class="pill" style="margin-bottom:22px;background:rgba(255,107,107,.14);border-color:rgba(255,107,107,.5);color:#ff9a9a">${E('1f4a5')} 공격</div>
  <h1 style="font-size:82px;margin-bottom:26px">빼앗고, 밀고, <span class="red">괴롭히고</span></h1>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
   ${skillPanel('a', '1fa9d', '갈고리', '끌어와서 키워드 1개 뺏기', '#ff6b8a')}
   ${skillPanel('b', '1f4a5', '충격파', '지그재그 파동으로 주변을 밀어내요', '#ff8a8a')}
   ${skillPanel('c', '2620', '독', '9초간 3초마다 키워드가 줄줄. 맞을수록 스택↑', '#5fe08a')}
   ${skillPanel('d', '1f576', '암흑', '3초간 상대 시야를 어둡게', '#c9b8ff')}
  </div>
</div>`,
script: [
 sceneJs('a', `{w:440,h:230,actors:{1:{x:70,y:115,r:34,level:10,me:true},2:{x:270,y:115,r:34,level:3,bg:'#4f8cff'}},events:[[0,{id:'hook',e:1,dx:1,dy:0,range:300,ms:450}],[500,{id:'hookHit',e:1,t:2,ms:700}]],at:760}`),
 sceneJs('b', `{w:440,h:230,actors:{1:{x:120,y:115,r:34,level:10,me:true},2:{x:300,y:115,r:28,level:3,bg:'#4f8cff'}},events:[[0,{id:'shockwave',e:1,x:120,y:115,r0:34,rMax:170,speed:300}]],at:330}`),
 sceneJs('c', `{w:440,h:230,actors:{1:{x:70,y:125,r:34,level:10,me:true},2:{x:330,y:125,r:34,level:3,bg:'#4f8cff'}},events:[[0,{id:'bolt',kind:'poison',bid:1,e:1,x:104,y:125,dx:1,dy:0,speed:300,range:200,radius:8}],[700,{id:'boltEnd',bid:1,hit:2,x:296,y:125}],[700,{id:'poison',t:2,stacks:2,ms:9000}]],at:1300}`),
 sceneJs('d', `{w:440,h:230,actors:{1:{x:70,y:125,r:34,level:10,me:true},2:{x:330,y:125,r:34,level:3,bg:'#4f8cff'}},events:[[0,{id:'bolt',kind:'darkness',bid:1,e:1,x:104,y:125,dx:1,dy:0,speed:300,range:200,radius:8}],[700,{id:'boltEnd',bid:1,hit:2,x:296,y:125}],[700,{id:'darkness',t:2,ms:3000}]],at:1250}`),
].join('\n') } });
const shieldExtra = `extra:(ctx,fx,at)=>{ctx.save();ctx.strokeStyle='#4ade80';ctx.lineWidth=9;ctx.setLineDash([16,9]);ctx.beginPath();ctx.arc(150,115,48,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(74,222,128,.12)';ctx.fill();ctx.font='900 30px "Noto Sans KR"';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=7;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.lineJoin='round';ctx.strokeText('3',150,52);ctx.fillStyle='#fff';ctx.fillText('3',150,52);ctx.restore();const im=new Image();}`;
s.push({ out: D3 + '03-defense.png', slide: { page: 3, pages: N3, foot: '방어 · 이동 스킬 4종', body: `
<div class="content" style="top:160px">
  <div class="pill" style="margin-bottom:22px">${E('1f6e1')} 방어 · 이동</div>
  <h1 style="font-size:82px;margin-bottom:26px">피하고, 숨고, <span class="em">풀어내고</span></h1>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
   ${skillPanel('a', '26a1', '대시', '순간 2배 속도로 질주해요', '#7fdbff')}
   ${skillPanel('b', '1f6e1', '방패', '잠깐 모든 원을 통과해요', '#4ade80')}
   ${skillPanel('c', '1f47b', '은신', '배경처럼 사라져요. 가까이 오면 !가 떠요', '#b9a8ff')}
   ${skillPanel('d', '2728', '정화', '독·암흑·갈고리를 한 번에 해제', '#7cd3ff')}
  </div>
</div>`,
script: [
 sceneJs('a', `{w:440,h:230,actors:{1:{x:300,y:115,r:34,level:10,me:true},2:{x:110,y:115,r:34,level:6,bg:'#4f8cff'}},events:[],at:600,extra:(ctx)=>{ctx.save();const g=ctx.createLinearGradient(110,0,300,0);g.addColorStop(0,'rgba(127,219,255,0)');g.addColorStop(1,'rgba(127,219,255,.75)');ctx.strokeStyle=g;ctx.lineWidth=38;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(120,115);ctx.lineTo(290,115);ctx.stroke();ctx.strokeStyle='rgba(127,219,255,.6)';ctx.lineWidth=6;ctx.beginPath();ctx.arc(300,115,44,0,Math.PI*2);ctx.stroke();ctx.restore();}}`),
 sceneJs('b', `{w:440,h:230,actors:{1:{x:150,y:115,r:34,level:10,me:true},2:{x:330,y:115,r:30,level:5,bg:'#4f8cff'}},events:[],at:600,${shieldExtra}}`),
 sceneJs('c', `{w:440,h:230,actors:{1:{x:200,y:115,r:38,level:10,me:true},2:{x:70,y:60,r:28,level:5,bg:'#4f8cff'}},events:[[0,{id:'stealth',e:1,ms:4200}]],at:1100}`),
 sceneJs('d', `{w:440,h:230,actors:{1:{x:220,y:125,r:38,level:10,me:true}},events:[[0,{id:'cleanse',e:1}]],at:330}`),
].join('\n') } });
s.push({ out: D3 + '04-cta.png', slide: { page: 4, pages: N3, foot: '#내슬롯4칸', swipe: false, body: `
<div class="content" style="top:168px;text-align:center">
  <div class="pill" style="margin-bottom:30px;background:rgba(255,209,102,.14);border-color:rgba(255,209,102,.5);color:var(--amber)">${E('1f4ac')} 댓글로 알려주세요</div>
  <h1 style="font-size:100px">내 스킬 슬롯<br><span class="amber">4칸의 조합은?</span></h1>
  <div style="display:flex;justify-content:center;gap:22px;margin-top:56px">
    ${[1, 2, 3, 4].map((n) => `<div class="card" style="width:190px;height:190px;border-radius:30px;border:3px dashed #3a475c;display:grid;place-items:center;position:relative"><span style="font-size:64px;color:#506178;font-weight:900">+</span><span style="position:absolute;left:14px;top:8px;font-weight:900;color:#7f90a8;font-size:28px">${n}</span></div>`).join('')}
  </div>
  <div style="margin-top:46px;font-size:38px;font-weight:700;line-height:1.5">공격형 · 도망형 · 방해형 · 올라운더<br><span class="muted" style="font-size:32px;font-weight:500">나는 어떤 스킬로 판을 뒤집을까요?</span></div>
  <div style="margin:46px auto 0;display:flex;align-items:center;justify-content:center;gap:36px">
    <div style="width:230px;height:230px;border-radius:28px;background:#fff;padding:18px">${QR.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>
    <div style="text-align:left"><div style="font-weight:900;font-size:64px;letter-spacing:-.02em">trendist<span class="em">.kr</span></div><div style="margin-top:10px;font-size:28px;color:var(--muted)">스킬창(K)에서 직접 조합해 보세요</div></div>
  </div>
</div>` } });

/* ============ 피드 4: 촉 테스트 퀴즈 (1장) ============ */
const opt = (l, n, col) => `<div class="card" style="display:flex;align-items:center;gap:30px;padding:30px 40px;margin-bottom:24px;border-color:${col}77"><div style="width:96px;height:96px;border-radius:50%;background:${col};color:#0b0f17;display:grid;place-items:center;font-weight:900;font-size:56px;flex:none">${l}</div><div style="font-weight:900;font-size:64px;letter-spacing:-.02em">${n}</div></div>`;
s.push({ out: ROOT + '/feed4-quiz/01-quiz.png', slide: { foot: '정답은 댓글로! 공개는 스토리에서', swipe: false, body: `
<div class="content" style="top:168px">
  <div class="pill" style="margin-bottom:30px">${E('1f9e0')} 촉 테스트</div>
  <h1 style="font-size:100px;margin-bottom:60px">유행이<br><span class="em">가장 오래 간</span> 건?</h1>
  ${opt('A', '탕후루', '#ffd166')}
  ${opt('B', '두바이 초콜릿', '#ff9f5a')}
  ${opt('C', '두쫀쿠', '#ff6b6b')}
  <div class="card" style="margin-top:34px;padding:26px 36px;font-size:36px;font-weight:700;line-height:1.45;text-align:center">${E('1f4ac')} 댓글에 <span class="amber" style="font-weight:900">A / B / C</span> 로 남겨 주세요<br><span class="muted" style="font-size:30px;font-weight:500">맞히면 당신은 이미 유행 감각 상위권</span></div>
</div>` } });

await render(s);
