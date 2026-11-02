import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 토스 미니앱(앱인토스) 빌드. 게임 코드는 상위 폴더의 src를 그대로 쓰고, 이 폴더의 .env로 토스 모드를 켠다.
// npm run build → dist(웹 번들) → ait build가 dist를 묶어 .ait 파일을 만든다.
// 로컬 개발(npm run dev, http://localhost:8082)은 웹과 같이 /api, /ws를 백엔드(8081)로 넘긴다.
const BACKEND = 'localhost:8081';
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  envDir: here,
  publicDir: '../public',
  plugins: [react()],
  // 관리자 페이지는 넣지 않고 게임(index.html)만 만든다
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 8082,
    strictPort: true,
    fs: { allow: ['..'] },
    proxy: {
      '/api': `http://${BACKEND}`,
      '/ws': { target: `ws://${BACKEND}`, ws: true },
      '^/share/': `http://${BACKEND}`,
    },
  },
});
