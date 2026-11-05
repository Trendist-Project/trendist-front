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
export function drawArt(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, r: number, scaleX = 1, rotation = 0) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); // 원 모양 잘라내기는 먼저 하므로 그림이 돌아도 원 밖으로 나가지 않는다
  ctx.imageSmoothingEnabled = false;
  // scaleX: 1이면 그대로, -1이면 좌우 반전. rotation: 라디안(시계 방향이 +). 반전을 먼저 하고 그 뒤에 돌린다
  if (scaleX !== 1 || rotation !== 0) { ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scaleX, 1); ctx.translate(-x, -y); }
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/**
 * 가는 방향(theta, 라디안, 0 = 오른쪽, 아래쪽이 +)에서 그림의 자세를 구한다(4.9). 그림은 오른쪽이 앞이라, 그 방향을 바라보게 돌린다.
 * 방향이 세로축(위·아래)을 넘어 왼쪽으로 가면 좌우 반전하고 그만큼 반대로 돌려서, 그림이 거꾸로 서지 않고 회전은 늘 ±90° 안에 있다.
 * face를 주면(세로축 근처에서 깜빡이지 않게 쥐고 있는 값) 그 값을 따른다. 없으면 방향으로 정한다.
 */
export function artPose(theta: number, face?: 1 | -1): { scaleX: 1 | -1; rotation: number } {
  const f = face ?? (Math.cos(theta) >= -1e-9 ? 1 : -1); // 정확히 세로(±90°)일 때는 부동소수점 오차와 관계없이 늘 같은 쪽(반전 없음)
  const rot = f === 1 ? theta : theta - Math.PI;
  return { scaleX: f, rotation: Math.atan2(Math.sin(rot), Math.cos(rot)) };
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
