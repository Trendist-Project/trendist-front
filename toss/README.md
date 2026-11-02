# trendist-toss

토스 미니앱(앱인토스)용 빌드. 콘솔 입력값·출시 기록은 [TOSS.md](TOSS.md). 게임 코드는 상위 폴더의 `src`를 그대로 쓰고, 이 폴더의 `.env`가 토스 모드(`VITE_PLATFORM=toss`)를 켠다. 자세한 내용은 백엔드 저장소 `docs/2-tech.md` 12절.

```bash
npm install
npm run build   # dist 생성 → trendist.ait 생성. 이 파일을 앱인토스 콘솔 [앱 번들]에 올린다
npm run dev     # http://localhost:8082 (백엔드 8081에 프록시)
```

- 백엔드 주소: `.env.production`의 `VITE_API_BASE`
- 앱 이름: `apps-in-toss.config.ts`의 `appName`은 콘솔에 등록한 이름과 같아야 한다
- 앱인토스 CLI가 Node 20 이상을 요구해서 개발 의존성 `node@22`를 두었다. `npm run`으로 실행하면 그 Node를 쓴다
