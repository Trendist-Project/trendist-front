import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 로컬 개발: 브라우저는 이 개발 서버(http://localhost:8080) 하나로 접속하고,
// /api와 /ws는 백엔드(8081)로 넘긴다. 운영에서는 Nginx가 같은 일을 한다(7절).
const BACKEND = 'localhost:8081';

export default defineConfig({
  plugins: [react()],
  // 게임(index.html)과 관리자 페이지(admin.html, 13절)를 따로 만든다. 관리자 페이지는 /admin.html로 연다
  build: {
    rollupOptions: {
      input: { main: 'index.html', admin: 'admin.html' },
    },
  },
  server: {
    port: 8080,
    strictPort: true,
    proxy: {
      '/api': `http://${BACKEND}`,
      '/ws': { target: `ws://${BACKEND}`, ws: true },
    },
  },
});
