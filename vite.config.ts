import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 서버는 /api와 /ws를 백엔드(8080)로 넘긴다. 운영에서는 Nginx가 같은 일을 한다(7절).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
