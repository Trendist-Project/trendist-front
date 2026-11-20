/**
 * 바다 보스(심해 문어·전기뱀장어·복어 대왕·대형 상어·대왕 고래, 4.35 바다 보스)의 패턴 연출. 서버는 모양 종류만 보낸다:
 * 예고(`tele`, k = 'sea')에 spots(원)·items(부채꼴)·lanes(띠)·radial(방사 선)·mark(표식)·swell(몸이 부풀거나 움츠러드는 배율)이 필요한 만큼 들어 있고,
 * 연출(`monsterFx`)은 flash·burst·mark·chain·sweep·wave·bubbles·pull·pulse와 look이 붙은 carrot(가시)·mochi(먹물 장판)다.
 * 색과 분위기는 look 하나로 정한다. 시작 시각과 값만 들고 있다가 그릴 때 계산한다(서버·화면이 같은 식).
 */

export interface SeaSpot { x: number; y: number; r: number }
export interface SeaLane { x: number; y: number; dir: number; len: number; w: number }
export interface SeaTele {
  k: 'sea'; look: string; ms: number; total: number;
  spots?: SeaSpot[]; items?: [number, number][]; x?: number; y?: number; range?: number;
  lanes?: SeaLane[]; radial?: { x: number; y: number; count: number; range: number; rot: number }; mark?: SeaSpot; swell?: number;
}
export type SeaFxKind = 'flash' | 'burst' | 'mark' | 'chain' | 'sweep' | 'wave' | 'bubbles' | 'pull' | 'pulse';
export type SeaFxMsg = { fx: SeaFxKind; id: number } & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const SEA_KINDS = new Set<string>(['flash', 'burst', 'mark', 'chain', 'sweep', 'wave', 'bubbles', 'pull', 'pulse']);

/** look별 색(r,g,b): 예고·번쩍임·고리가 같은 색을 쓴다 */
const LOOK: Record<string, [number, number, number]> = {
  sweep: [200, 80, 190], ink: [90, 40, 140], pull: [150, 90, 220], bolt: [255, 226, 70], danger: [255, 80, 70], thorn: [255, 160, 60], hunt: [255, 70, 70],
  tail: [255, 90, 90], wave: [90, 170, 255], spout: [120, 220, 255], song: [170, 150, 255], bite: [255, 70, 70], water: [140, 220, 255], mark: [255, 226, 70],
};
const col = (look: string | undefined): [number, number, number] => LOOK[look ?? 'danger'] ?? LOOK.danger;
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;

interface Fx { kind: SeaFxKind; at: number; ms: number; d: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
interface Zone { spots: SeaSpot[]; ms: number; at: number }
interface Spikes { x: number; y: number; angles: number[]; speed: number; range: number; r: number; at: number }

export class SeaFx {
  private list: Fx[] = [];
  private zones: Zone[] = [];
  private spikes: Spikes[] = [];
  private bubbles: { list: SeaSpot[]; at: number } | null = null;
  constructor(private reduceMotion: boolean) {}

  clear() { this.list = []; this.zones = []; this.spikes = []; this.bubbles = null; }

  fx(m: SeaFxMsg, now: number) {
    if (m.fx === 'bubbles') { this.bubbles = { list: m.list as SeaSpot[], at: now }; return; }
    const ms = m.fx === 'chain' ? 600 : m.fx === 'wave' ? ((m.len as number) + (m.band as number)) / (m.speed as number) * 1000 + 100 : (m.ms as number | undefined) ?? (m.fx === 'burst' ? 550 : 400);
    this.list.push({ kind: m.fx, at: now, ms, d: m });
    if (this.list.length > 60) this.list.splice(0, this.list.length - 60);
  }
  addZone(spots: SeaSpot[], ms: number, now: number) { this.zones.push({ spots, ms, at: now }); if (this.zones.length > 12) this.zones.shift(); }
  addSpikes(s: Omit<Spikes, 'at'>, now: number) { this.spikes.push({ ...s, at: now }); if (this.spikes.length > 12) this.spikes.shift(); }

  // ------------------------------------------------------------ 예고(몸 아래)

  /** 몸이 부풀거나 움츠러드는 배율(예고가 진행될수록 1 → swell) */
  swell(t: SeaTele | undefined): number {
    if (!t || t.k !== 'sea' || !t.swell || this.reduceMotion) return 1;
    return 1 + (t.swell - 1) * (1 - t.ms / Math.max(1, t.total));
  }

  drawTele(ctx: CanvasRenderingContext2D, t: SeaTele, now: number, px: number) {
    const c = col(t.look), prog = 1 - t.ms / Math.max(1, t.total);
    const dash = this.reduceMotion ? 0 : -now / 30;
    ctx.save();
    for (const sp of t.spots ?? []) this.ring(ctx, sp.x, sp.y, sp.r, c, prog, px, dash, t.look === 'pull');
    if (t.items && t.x !== undefined && t.y !== undefined && t.range) {
      for (const [a0, a1] of t.items) {
        ctx.fillStyle = rgba(c, 0.1 + 0.22 * prog);
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.arc(t.x, t.y, t.range, a0, a1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgba(c, 0.45 + 0.45 * prog); ctx.lineWidth = 6 * px * 2; ctx.setLineDash([60 * px * 2, 40 * px * 2]); ctx.lineDashOffset = dash;
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const ln of t.lanes ?? []) this.lane(ctx, ln, c, 0.08 + 0.2 * prog, 0.45 + 0.45 * prog, px, dash);
    if (t.radial) {
      ctx.strokeStyle = rgba(c, 0.35 + 0.45 * prog); ctx.lineWidth = 5 * px * 2; ctx.setLineDash([50 * px * 2, 36 * px * 2]); ctx.lineDashOffset = dash;
      for (let i = 0; i < t.radial.count; i++) {
        const a = t.radial.rot + i * Math.PI * 2 / t.radial.count;
        ctx.beginPath(); ctx.moveTo(t.radial.x, t.radial.y); ctx.lineTo(t.radial.x + Math.cos(a) * t.radial.range, t.radial.y + Math.sin(a) * t.radial.range); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (t.mark) this.target(ctx, t.mark, c, now, px);
    ctx.restore();
  }

  private ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: [number, number, number], prog: number, px: number, dash: number, inward = false) {
    ctx.fillStyle = rgba(c, 0.07 + 0.2 * prog);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(c, 0.45 + 0.45 * prog); ctx.lineWidth = 7 * px * 2; ctx.setLineDash([56 * px * 2, 38 * px * 2]); ctx.lineDashOffset = inward ? -dash : dash;
    ctx.beginPath(); ctx.arc(x, y, r * (inward ? 1 : 1 - 0.1 * (1 - prog)), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  private lane(ctx: CanvasRenderingContext2D, ln: SeaLane, c: [number, number, number], fill: number, stroke: number, px: number, dash: number) {
    ctx.save();
    ctx.translate(ln.x, ln.y); ctx.rotate(ln.dir);
    ctx.fillStyle = rgba(c, fill); ctx.fillRect(-ln.len / 2, -ln.w / 2, ln.len, ln.w);
    ctx.strokeStyle = rgba(c, stroke); ctx.lineWidth = 6 * px * 2; ctx.setLineDash([60 * px * 2, 40 * px * 2]); ctx.lineDashOffset = dash;
    ctx.strokeRect(-ln.len / 2, -ln.w / 2, ln.len, ln.w);
    ctx.restore();
  }

  /** 표식: 맥동하는 고리와 십자선(누가 노려지는지) */
  private target(ctx: CanvasRenderingContext2D, s: SeaSpot, c: [number, number, number], now: number, px: number) {
    const pulse = this.reduceMotion ? 1 : 1 + 0.08 * Math.sin(now / 90);
    ctx.strokeStyle = rgba(c, 0.95); ctx.lineWidth = 8 * px * 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x - s.r * 1.3, s.y); ctx.lineTo(s.x - s.r * 0.6, s.y); ctx.moveTo(s.x + s.r * 0.6, s.y); ctx.lineTo(s.x + s.r * 1.3, s.y);
    ctx.moveTo(s.x, s.y - s.r * 1.3); ctx.lineTo(s.x, s.y - s.r * 0.6); ctx.moveTo(s.x, s.y + s.r * 0.6); ctx.lineTo(s.x, s.y + s.r * 1.3); ctx.stroke();
  }

  // ------------------------------------------------------------ 바닥(몸 아래): 남아 있는 먹물 장판, 경고 원, 끌기 물결

  drawGround(ctx: CanvasRenderingContext2D, now: number, px: number) {
    this.zones = this.zones.filter((z) => now - z.at < z.ms);
    for (const z of this.zones) for (let i = 0; i < z.spots.length; i++) this.inkPatch(ctx, z.spots[i], i, now - z.at, z.ms, now, px);
    this.list = this.list.filter((f) => now - f.at < f.ms + 150);
    for (const f of this.list) {
      const u = Math.min(1, (now - f.at) / Math.max(1, f.ms));
      if (f.kind === 'mark') { // 경고 원: 점점 짙어지다 사라진다
        const c = col(f.d.look as string);
        ctx.save();
        this.ring(ctx, f.d.x as number, f.d.y as number, f.d.r as number, c, u, px, this.reduceMotion ? 0 : -now / 30);
        ctx.restore();
      } else if (f.kind === 'pull') {
        const x = f.d.x as number, y = f.d.y as number, range = f.d.range as number, c = col('pull');
        ctx.save();
        for (let k = 0; k < 4; k++) {
          const p = (u * 3 + k / 4) % 1, rr = range * (1 - p) + 100;
          ctx.strokeStyle = rgba(c, 0.5 * Math.sin(p * Math.PI)); ctx.lineWidth = 14 * px * 2;
          ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  /** 먹물 장판: 보라 먹빛 얼룩, 가장자리가 출렁이고 번들거린다. 사라지기 전 0.8초는 흐려진다 */
  private inkPatch(ctx: CanvasRenderingContext2D, sp: SeaSpot, idx: number, age: number, ms: number, now: number, px: number) {
    const drop = Math.min(1, age / 350), pop = this.reduceMotion ? 1 : drop < 1 ? 0.3 + 0.8 * drop : 1 + 0.05 * Math.sin((age - 350) / 150) * Math.exp(-(age - 350) / 500);
    const left = ms - age, fade = left >= 800 ? 1 : 0.15 + 0.85 * Math.max(0, left) / 800, R = sp.r * pop, n = 30;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fade));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, w = this.reduceMotion ? 0 : 0.05 * Math.sin(a * 5 + now / 420 + idx) + 0.03 * Math.sin(a * 3 - now / 560), rr = R * (0.96 + w);
      if (i === 0) ctx.moveTo(sp.x + Math.cos(a) * rr, sp.y + Math.sin(a) * rr); else ctx.lineTo(sp.x + Math.cos(a) * rr, sp.y + Math.sin(a) * rr);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(sp.x - R * 0.2, sp.y - R * 0.25, R * 0.1, sp.x, sp.y, R);
    g.addColorStop(0, 'rgba(70,40,110,0.92)'); g.addColorStop(0.7, 'rgba(36,18,66,0.92)'); g.addColorStop(1, 'rgba(18,8,38,0.92)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(150,100,220,0.85)'; ctx.lineWidth = 7 * px * 2; ctx.stroke();
    for (let i = 0; i < 6; i++) { // 번들거리는 하이라이트 방울
      const a = i * 2.399 + idx * 1.7, d = 0.2 + 0.55 * ((i * 37 + idx * 11) % 10) / 10, ph = this.reduceMotion ? 0.5 : (Math.sin(now / 700 + i * 1.9 + idx) + 1) / 2;
      ctx.fillStyle = 'rgba(200,170,255,0.35)'; ctx.beginPath(); ctx.arc(sp.x + Math.cos(a) * R * d, sp.y + Math.sin(a) * R * d, R * (0.04 + 0.03 * ph), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ 모든 원 위

  drawOver(ctx: CanvasRenderingContext2D, now: number, px: number) {
    for (const f of this.list) {
      const u = Math.min(1, (now - f.at) / Math.max(1, f.ms));
      if (u >= 1 && f.kind !== 'wave' && f.kind !== 'sweep') continue;
      switch (f.kind) {
        case 'flash': this.drawFlash(ctx, f, u, px); break;
        case 'burst': this.drawBurst(ctx, f, now, px); break;
        case 'chain': this.drawChain(ctx, f, u, now, px); break;
        case 'sweep': this.drawSweep(ctx, f, now, px); break;
        case 'wave': this.drawWave(ctx, f, now, px); break;
        case 'pulse': this.drawPulse(ctx, f, now, px); break;
        default: break;
      }
    }
    this.drawSpikes(ctx, now, px);
    this.drawBubbles(ctx, now, px);
  }

  /** 번쩍임: 띠·부채꼴·원이 빠르게 밝아졌다 사라진다 */
  private drawFlash(ctx: CanvasRenderingContext2D, f: Fx, u: number, px: number) {
    const c = col(f.d.look as string), a = 1 - u;
    ctx.save();
    for (const ln of (f.d.lanes as SeaLane[] | undefined) ?? []) {
      this.lane(ctx, ln, c, 0.55 * a, 0.95 * a, px, 0);
      ctx.save(); ctx.translate(ln.x, ln.y); ctx.rotate(ln.dir); ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`; ctx.fillRect(-ln.len / 2, -ln.w * 0.08, ln.len, ln.w * 0.16); ctx.restore();
    }
    const items = f.d.items as [number, number][] | undefined;
    if (items) for (const [a0, a1] of items) {
      ctx.fillStyle = rgba(c, 0.55 * a);
      ctx.beginPath(); ctx.moveTo(f.d.x as number, f.d.y as number); ctx.arc(f.d.x as number, f.d.y as number, f.d.range as number, a0, a1); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /** 퍼지는 고리 + look에 맞는 알갱이(가시·물방울·번개 조각) */
  private drawBurst(ctx: CanvasRenderingContext2D, f: Fx, now: number, px: number) {
    const u = Math.min(1, (now - f.at) / f.ms), x = f.d.x as number, y = f.d.y as number, r = f.d.r as number, look = f.d.look as string, c = col(look);
    const e = 1 - Math.pow(1 - u, 2);
    ctx.save();
    ctx.fillStyle = rgba(c, 0.28 * (1 - u)); ctx.beginPath(); ctx.arc(x, y, r * (0.15 + 0.85 * e), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(c, 0.95 * (1 - u)); ctx.lineWidth = Math.max(10 * px * 2, r * 0.05) * (1 - u * 0.6);
    ctx.beginPath(); ctx.arc(x, y, r * (0.2 + 0.8 * e), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - u)})`; ctx.lineWidth *= 0.3;
    ctx.beginPath(); ctx.arc(x, y, r * (0.18 + 0.8 * e), 0, Math.PI * 2); ctx.stroke();
    if (!this.reduceMotion) {
      const n = look === 'thorn' ? 20 : 12;
      for (let i = 0; i < n; i++) { // 정해진 각도로 흩어지는 조각(i로 계산)
        const a = i * 2.399, d = r * (0.25 + 0.75 * e) * (0.75 + 0.25 * ((i * 7) % 5) / 4), s = r * 0.045 * (1 - u);
        const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d - (look === 'water' || look === 'spout' ? u * r * 0.15 : 0);
        ctx.fillStyle = look === 'thorn' ? `rgba(120,70,30,${1 - u})` : rgba(c, 0.85 * (1 - u));
        if (look === 'thorn') { ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(s * 2.6, 0); ctx.lineTo(-s, -s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill(); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(cx, cy, s * 1.4, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();
  }

  /** 번개 사슬: 점들을 잇는 들쭉날쭉한 번개(깜빡이며 사라진다) */
  private drawChain(ctx: CanvasRenderingContext2D, f: Fx, u: number, now: number, px: number) {
    const pts = f.d.pts as SeaSpot[];
    if (!pts || pts.length < 2) return;
    const seed = Math.floor(now / 60), fade = (1 - u) * (this.reduceMotion ? 1 : 0.6 + 0.4 * (seed % 2));
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass === 0 ? rgba(col('bolt'), 0.85 * fade) : `rgba(255,255,255,${0.95 * fade})`;
      ctx.lineWidth = (pass === 0 ? 26 : 9) * px * 2;
      ctx.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), n = Math.max(2, Math.round(d / 220)), nx = -dy / (d || 1), ny = dx / (d || 1);
        if (i === 0) ctx.moveTo(a.x, a.y);
        for (let k = 1; k <= n; k++) {
          const t = k / n, j = k === n || this.reduceMotion ? 0 : (((seed * 31 + i * 17 + k * 13) % 11) / 11 - 0.5) * 220;
          ctx.lineTo(a.x + dx * t + nx * j, a.y + dy * t + ny * j);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 촉수 휘두르기: 몸 중심에서 뻗은 촉수가 돌아간다(끝으로 갈수록 가늘고 빨판 점이 있다). 끝난 뒤 0.15초 사라진다 */
  private drawSweep(ctx: CanvasRenderingContext2D, f: Fx, now: number, px: number) {
    const d = f.d, t = now - f.at;
    if (t > f.ms + 150) return;
    const u = Math.min(1, t / f.ms), fade = t > f.ms ? 1 - (t - f.ms) / 150 : 1;
    const x = d.x as number, y = d.y as number, range = d.range as number, width = d.width as number, arms = d.arms as number;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    for (let i = 0; i < arms; i++) {
      const a = (d.base as number) + i * Math.PI * 2 / arms + (d.dir as number) * (d.span as number) * u;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, range, 0);
      g.addColorStop(0, 'rgba(110,50,170,0.95)'); g.addColorStop(1, 'rgba(190,100,220,0.85)');
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(60,20,100,0.9)'; ctx.lineWidth = 6 * px * 2;
      ctx.beginPath(); ctx.moveTo(0, -width * 0.5); ctx.quadraticCurveTo(range * 0.5, -width * 0.38, range, -width * 0.04); ctx.quadraticCurveTo(range * 1.02, 0, range, width * 0.04);
      ctx.quadraticCurveTo(range * 0.5, width * 0.38, 0, width * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,200,230,0.75)'; // 빨판
      for (let k = 1; k <= 6; k++) { const p = k / 7; ctx.beginPath(); ctx.arc(range * p, 0, width * 0.13 * (1 - p * 0.6), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
  }

  /** 거대 파도: 앞면이 전진하는 띠(앞은 흰 거품, 뒤로 갈수록 푸르게 흐려진다) */
  private drawWave(ctx: CanvasRenderingContext2D, f: Fx, now: number, px: number) {
    const d = f.d, front = (d.speed as number) * (now - f.at) / 1000, band = d.band as number, w = d.w as number, len = d.len as number;
    if (front > len + band) return;
    ctx.save();
    ctx.translate(d.x as number, d.y as number); ctx.rotate(d.dir as number);
    const x0 = front - band;
    const g = ctx.createLinearGradient(x0, 0, front, 0);
    g.addColorStop(0, 'rgba(60,130,230,0)'); g.addColorStop(0.7, 'rgba(70,150,255,0.55)'); g.addColorStop(1, 'rgba(235,248,255,0.92)');
    ctx.fillStyle = g; ctx.fillRect(x0, -w / 2, band, w);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(14 * px * 2, band * 0.05);
    ctx.beginPath();
    const n = 16;
    for (let i = 0; i <= n; i++) { // 물결치는 앞면
      const yy = -w / 2 + w * i / n, off = this.reduceMotion ? 0 : Math.sin(i * 1.3 + now / 120) * band * 0.06;
      if (i === 0) ctx.moveTo(front + off, yy); else ctx.lineTo(front + off, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** 고래의 노래: 몸에서 동심원 파동이 세 겹으로 퍼진다 */
  private drawPulse(ctx: CanvasRenderingContext2D, f: Fx, now: number, px: number) {
    const u = (now - f.at) / f.ms;
    if (u >= 1) return;
    const c = col(f.d.look as string);
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const p = u * 1.6 - k * 0.22;
      if (p <= 0 || p >= 1) continue;
      ctx.strokeStyle = rgba(c, 0.8 * (1 - p)); ctx.lineWidth = 22 * px * 2 * (1 - p * 0.6);
      ctx.beginPath(); ctx.arc(f.d.x as number, f.d.y as number, (f.d.r as number) * p, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  /** 날아가는 가시: 시작점에서 각도 방향으로 speed로 range까지 직선(갈색 뾰족한 가시, 진행 방향으로 회전) */
  private drawSpikes(ctx: CanvasRenderingContext2D, now: number, px: number) {
    this.spikes = this.spikes.filter((s) => (now - s.at) / 1000 * s.speed < s.range + s.r * 2);
    for (const s of this.spikes) {
      const d = Math.min(s.range, (now - s.at) / 1000 * s.speed), fade = s.range - d < s.r * 2 ? Math.max(0, (s.range - d) / (s.r * 2)) : 1, L = s.r * 3.2, W = s.r * 0.9;
      for (const a of s.angles) {
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d); ctx.rotate(a);
        const g = ctx.createLinearGradient(-L * 0.5, 0, L * 0.6, 0);
        g.addColorStop(0, '#d9a45c'); g.addColorStop(1, '#6b3d12');
        ctx.fillStyle = g; ctx.strokeStyle = '#3d2208'; ctx.lineWidth = Math.max(2 * px, s.r * 0.08);
        ctx.beginPath(); ctx.moveTo(L * 0.6, 0); ctx.lineTo(-L * 0.4, -W * 0.5); ctx.lineTo(-L * 0.25, 0); ctx.lineTo(-L * 0.4, W * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(120,200,90,0.8)'; // 독이 묻은 끝
        ctx.beginPath(); ctx.arc(L * 0.4, 0, W * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  /** 거품: 서버가 0.15초마다 알려 주는 위치에 투명한 거품(하이라이트 둘). 0.7초 넘게 소식이 없으면 사라진다 */
  private drawBubbles(ctx: CanvasRenderingContext2D, now: number, px: number) {
    const b = this.bubbles;
    if (!b) return;
    if (now - b.at > 700) { this.bubbles = null; return; }
    for (const s of b.list) {
      const wob = this.reduceMotion ? 1 : 1 + 0.06 * Math.sin(now / 130 + s.x * 0.01);
      const g = ctx.createRadialGradient(s.x - s.r * 0.3, s.y - s.r * 0.35, s.r * 0.1, s.x, s.y, s.r * wob);
      g.addColorStop(0, 'rgba(235,250,255,0.55)'); g.addColorStop(0.8, 'rgba(120,200,240,0.35)'); g.addColorStop(1, 'rgba(90,170,230,0.6)');
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(210,240,255,0.9)'; ctx.lineWidth = Math.max(4 * px * 2, s.r * 0.07);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * wob, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(s.x - s.r * 0.35, s.y - s.r * 0.4, s.r * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s.x + s.r * 0.3, s.y + s.r * 0.35, s.r * 0.08, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** 상어 잠수: 몸 대신 물결과 등지느러미가 몸 둘레를 돈다 */
  drawDive(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number, px: number) {
    const a = this.reduceMotion ? 0 : now / 260;
    ctx.save();
    ctx.strokeStyle = 'rgba(190,230,255,0.55)'; ctx.lineWidth = 10 * px * 2;
    for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.arc(x, y, r * (0.45 + 0.25 * k) * (1 + 0.04 * Math.sin(now / 200 + k)), 0, Math.PI * 2); ctx.stroke(); }
    const fx = x + Math.cos(a) * r * 0.42, fy = y + Math.sin(a) * r * 0.42, s = r * 0.22;
    ctx.translate(fx, fy); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = '#5b6b80'; ctx.strokeStyle = '#2b3646'; ctx.lineWidth = Math.max(3 * px, s * 0.1);
    ctx.beginPath(); ctx.moveTo(0, -s * 1.5); ctx.quadraticCurveTo(s * 0.9, -s * 0.2, s * 0.7, s * 0.7); ctx.lineTo(-s * 0.7, s * 0.7); ctx.quadraticCurveTo(-s * 0.2, -s * 0.2, 0, -s * 1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
