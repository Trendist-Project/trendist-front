/**
 * 픽셀 그림(4.9) 공통: 32×32 칸, 칸마다 한 글자(팔레트 번호 0-9a-v, '.'은 투명 = 원의 바탕색).
 * 아레나는 서버가 그린 PNG(/api/art/{id}.png?v=)를 받아 원 안에 칸이 또렷하게(보간 없이) 키워 그린다.
 */
export const ART_SIZE = 32;
export const ART_DIGITS = '0123456789abcdefghijklmnopqrstuv';

const images = new Map<string, HTMLImageElement>();

/** 주소의 이미지. 처음 부르면 받기 시작하고, 다 받기 전에는 null. 주소에 버전이 붙어 있어 한 번 받은 그림은 바뀌지 않는다. */
export function artImage(url: string): HTMLImageElement | null {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    images.set(url, img);
    if (images.size > 400) images.delete(images.keys().next().value as string); // 오래된 것부터 버린다
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** 원 안으로 잘라 그린다. 바탕색 원은 먼저 칠해 두어 투명한 칸에 보인다. */
export function drawArt(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, r: number) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** 칸 글자와 팔레트로 32×32 캔버스를 만든다(편집기 미리 보기용). */
export function artCanvas(palette: string[], pixels: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ART_SIZE; c.height = ART_SIZE;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < pixels.length; i++) {
    const ch = pixels[i];
    if (ch === '.') continue;
    const color = palette[ART_DIGITS.indexOf(ch)];
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.fillRect(i % ART_SIZE, Math.floor(i / ART_SIZE), 1, 1);
  }
  return c;
}

/** 칸마다 색(#rrggbb 또는 null=투명) 배열 ↔ 저장 형식 */
export function decodeArt(art: { palette: string[]; pixels: string } | null): (string | null)[] {
  const out: (string | null)[] = new Array(ART_SIZE * ART_SIZE).fill(null);
  if (!art) return out;
  for (let i = 0; i < out.length && i < art.pixels.length; i++) {
    const ch = art.pixels[i];
    out[i] = ch === '.' ? null : art.palette[ART_DIGITS.indexOf(ch)] ?? null;
  }
  return out;
}

export function encodeArt(cells: (string | null)[]): { palette: string[]; pixels: string } {
  const palette: string[] = [];
  let pixels = '';
  for (const c of cells) {
    if (!c) { pixels += '.'; continue; }
    let i = palette.indexOf(c);
    if (i < 0) { palette.push(c); i = palette.length - 1; }
    pixels += ART_DIGITS[i] ?? '.';
  }
  return { palette, pixels };
}
