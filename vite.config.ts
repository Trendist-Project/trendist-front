import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 로컬 개발: 브라우저는 이 개발 서버(http://localhost:8080) 하나로 접속하고,
// /api, /ws, /share/(공유 카드), /{kr|global}/keywords/(키워드 페이지)는 백엔드(8081)로 넘긴다. 운영에서는 Nginx가 같은 일을 한다(7절).
const BACKEND = 'localhost:8081';

export default defineConfig({
  plugins: [react()],
  // 게임(index.html)과 관리자 페이지(admin/index.html, 13절)를 따로 만든다. 주소는 /admin/ (웹 서버가 폴더의 index.html을 연다)
  build: {
    rollupOptions: {
      input: { main: 'index.html', admin: 'admin/index.html' },
    },
  },
  server: {
    port: 8080,
    strictPort: true,
    proxy: {
      '/api': `http://${BACKEND}`,
      '/ws': { target: `ws://${BACKEND}`, ws: true },
      // 자랑하기 카드 공유 페이지·이미지(4.24). 프론트 파일(/src/ShareCardView.tsx 등)과 겹치지 않게 /share/로 시작하는 것만
      '^/share/': `http://${BACKEND}`,
      // 공개 키워드 페이지(/kr/keywords/…, /global/keywords/…)와 키워드 사이트맵(4.28)
      '^/(kr|global)/keywords/': `http://${BACKEND}`,
      '^/sitemap\\.xml$': `http://${BACKEND}`,
    },
  },
});
