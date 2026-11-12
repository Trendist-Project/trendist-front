# 인스타그램 이미지 소스

이미지를 수정해서 다시 만들 때 쓰는 소스다. (결과 이미지는 한 단계 위 폴더)

- `patch.mjs`: **패치노트 피드**(사진 1장 + 캡션). 피드 목록·문구·캡션이 모두 이 파일에 있고, 실행하면 `../patch-notes/NN-xxx.png`와 `../patch-notes/feeds.md`를 만든다. 양식과 요청 방법은 `marketing/README.md`.
- `feed1.mjs`, `feed234.mjs`: 런칭 캐러셀 슬라이드별 HTML(카피·배치). `overview.mjs`: 16장 미리보기 생성.
- `build.mjs`: 공통 틀(배경·로고·페이지 표시), 렌더러, 패치노트 틀의 자동 맞춤(`FIT`). `base.css`: 색·글꼴·공통 스타일. `lib.js`: 원·거북이·스킬 장면을 그리는 도우미(캔버스 글자 이모지 → Twemoji 표 `EMO`).
- `game.bundle.js`: 게임의 거북이(`turtle.ts`)와 스킬 연출(`skillFx.ts`)을 브라우저용으로 묶은 파일.
  `cd trendist-front && npx esbuild <entry.ts> --bundle --format=iife --global-name=Game --outfile=marketing/instagram/_src/game.bundle.js` 로 다시 만든다(entry는 두 파일을 export).
- `qr.svg`: 런칭 QR(UTM `launch`). `qr-patch.svg`: 패치노트 QR(UTM `patch`). 새 QR은 `node -e "require('qrcode').toString(url,{type:'svg',margin:0},(e,s)=>require('fs').writeFileSync('qr-x.svg',s))"`.

## 다시 만들 때 필요한 것

```bash
cd trendist-front/marketing/instagram/_src
npm install                 # package.json의 의존성(Noto Sans KR·Noto Color Emoji·Twemoji SVG·playwright-core·qrcode)
npm run build:patch         # 패치노트 피드
node feed1.mjs && node feed234.mjs && node overview.mjs   # 런칭 캐러셀
```

- 경로는 모두 이 폴더 기준(상대 경로)이라 어느 PC에서나 `npm install` 뒤 바로 된다. `node_modules`·`.libs`·`_tmp.html`은 git에 올리지 않는다.
- 크로미엄: Playwright가 `~/.cache/ms-playwright/chromium_headless_shell-*`를 쓴다. 없으면 `npx playwright-core install chromium-headless-shell`.
- 크로미엄이 `libnss3.so`·`libnspr4.so`를 못 찾으면 `sudo apt install libnss3 libnspr4`. sudo를 못 쓰면 `apt-get download libnss3 libnspr4` → `dpkg-deb -x <deb> x` → `x/usr/lib/x86_64-linux-gnu/*.so*`를 `_src/.libs/`에 복사한다(`build.mjs`가 있으면 `LD_LIBRARY_PATH`에 넣는다).

## 라이선스
Noto Sans KR·Noto Color Emoji: SIL OFL 1.1 / Twemoji 그래픽: CC-BY 4.0(캡션에 표기) / 로고·거북이·장로 거북이: 서비스 자산.
