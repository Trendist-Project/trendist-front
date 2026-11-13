import { t as tr } from '../../i18n';

/**
 * 세이프존(4.22): 가운데 고정 존(파란색)과 시간제 무작위 존(연두색, 성장 캐릭터 바탕색 #3fb68b과 겹치지 않는 노란 기 초록).
 * 서버가 알려 준 목록을 들고, 아레나 바닥·미니맵에 그리고, 어떤 자리가 존 안인지 답한다(서버 Room.inSafeZone과 같은 규칙).
 */
const CENTER_ZONE_FILL = 'rgba(79,140,255,0.16)';
const CENTER_ZONE_LINE = '#4f8cff';
const ZONE_FILL = 'rgba(166,224,74,0.14)';
const ZONE_LINE = '#a6e04a';
const ZONE_BLINK_MS = 30000;   // 사라지기 30초 전부터 깜빡인다

interface Zone { id: number; x: number; y: number; size: number; until: number }

export class SafeZones {
  private center = 0;
  private zones: Zone[] = [];

  constructor(private readonly reducedMotion: boolean) {}

  /** 세이프존 목록([번호, x, y, 한 변, 남은 ms]). 남은 시간은 받은 순간부터 센다 */
  set(center: number, list: [number, number, number, number, number][]) {
    const now = performance.now();
    this.center = center;
    this.zones = list.map(([id, x, y, size, ms]) => ({ id, x, y, size, until: now + ms }));
  }

  /** 그 자리(월드 좌표)가 가운데 고정 존이나 아직 남아 있는 무작위 존 안인지 */
  contains(x: number, y: number, now: number): boolean {
    const c = this.center / 2;
    if (c > 0 && Math.abs(x) <= c && Math.abs(y) <= c) return true;
    for (const z of this.zones) {
      const h = z.size / 2;
      if (z.until > now && Math.abs(x - z.x) <= h && Math.abs(y - z.y) <= h) return true;
    }
    return false;
  }

  /** 아레나 바닥(화면 근처만). 무작위 존은 남은 시간을 보여 주고 사라지기 30초 전부터 깜빡인다 */
  draw(ctx: CanvasRenderingContext2D, now: number, view: { x: number; y: number }, z: number, w: number, h: number) {
    const viewHalfW = w / 2 / z, viewHalfH = h / 2 / z;
    const visible = (x: number, y: number, size: number) =>
      Math.abs(x - view.x) <= viewHalfW + size / 2 && Math.abs(y - view.y) <= viewHalfH + size / 2;
    const label = (text: string, x: number, y: number, color: string) => {
      const fs = 14 / z;
      ctx.font = `700 ${fs}px "Noto Sans KR", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      ctx.fillText(text, x, y + 8 / z);
    };
    this.zones = this.zones.filter((zone) => zone.until > now);
    for (const zone of this.zones) {
      if (!visible(zone.x, zone.y, zone.size)) continue;
      const left = zone.until - now;
      const blink = left < ZONE_BLINK_MS && !this.reducedMotion ? 0.55 + 0.45 * Math.abs(Math.sin(now / 250)) : 1;
      const x0 = zone.x - zone.size / 2, y0 = zone.y - zone.size / 2;
      ctx.globalAlpha = blink;
      ctx.fillStyle = ZONE_FILL;
      ctx.fillRect(x0, y0, zone.size, zone.size);
      ctx.strokeStyle = ZONE_LINE;
      ctx.lineWidth = 3 / z;
      ctx.setLineDash([16 / z, 10 / z]);
      ctx.strokeRect(x0, y0, zone.size, zone.size);
      ctx.setLineDash([]);
      const sec = Math.ceil(left / 1000);
      label(tr('arena.safeZone', { time: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }), zone.x, y0, '#d6f5a8');
      ctx.globalAlpha = 1;
    }
    const c = this.center;
    if (c > 0 && visible(0, 0, c)) {
      ctx.fillStyle = CENTER_ZONE_FILL;
      ctx.fillRect(-c / 2, -c / 2, c, c);
      ctx.strokeStyle = CENTER_ZONE_LINE;
      ctx.lineWidth = 4 / z;
      ctx.strokeRect(-c / 2, -c / 2, c, c);
      label(tr('arena.safeZoneFixed'), 0, -c / 2, '#bcd4ff');
    }
  }

  /** 미니맵: 가운데는 파란 칸, 무작위 존은 연두색 칸. s는 월드 → 미니맵 배율 */
  drawMinimap(ctx: CanvasRenderingContext2D, toX: (x: number) => number, toY: (y: number) => number, s: number) {
    ctx.fillStyle = 'rgba(79,140,255,0.55)';
    const c = this.center * s;
    ctx.fillRect(toX(0) - c / 2, toY(0) - c / 2, Math.max(2, c), Math.max(2, c));
    ctx.fillStyle = 'rgba(166,224,74,0.55)';
    for (const z of this.zones) {
      const zs = Math.max(2, z.size * s);
      ctx.fillRect(toX(z.x) - zs / 2, toY(z.y) - zs / 2, zs, zs);
    }
  }
}
