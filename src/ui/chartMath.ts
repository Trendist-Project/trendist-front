/** 그래프 공통 계산(활동 그래프 4.12, 점수 추이 4.15). */

/**
 * 축 최댓값을 보기 좋은 수로 올린다. 눈금은 0, 절반, 최댓값이라 절반도 정수가 되도록 짝수 계열(2, 4, 6, 10 × 10ⁿ)만 쓴다.
 * 1이나 5를 최댓값으로 쓰면 가운데 눈금이 0.5, 2.5가 되어 반올림하면 "1, 1"이나 "3"처럼 틀린 값이 나온다.
 */
export function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  if (exp >= 10 && n <= 1) return exp; // 10, 100 …의 절반은 정수다
  return (n <= 2 ? 2 : n <= 4 ? 4 : n <= 6 ? 6 : 10) * exp;
}

/** 단조 3차 보간(Fritsch–Carlson): 부드럽지만 값 사이에서 위아래로 넘치지 않는 곡선. */
export function smoothPath(pts: [number, number][]) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const n = pts.length, dx: number[] = [], m: number[] = [], t: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); m.push((pts[i + 1][1] - pts[i][1]) / dx[i]); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}
