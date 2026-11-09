# 인스타그램 이미지 소스

이미지를 수정해서 다시 만들 때 쓰는 소스다. (결과 이미지는 한 단계 위 폴더)

- `feed1.mjs`, `feed234.mjs`: 슬라이드별 HTML(카피·배치). 문구를 고치고 다시 실행하면 PNG가 갱신된다.
- `build.mjs`: 공통 틀(배경·로고·페이지 표시)과 렌더러. `base.css`: 색·글꼴·공통 스타일. `lib.js`: 원·거북이·스킬 장면을 그리는 도우미.
- `game.bundle.js`: 게임의 거북이(`turtle.ts`)와 스킬 연출(`skillFx.ts`)을 브라우저용으로 묶은 파일.
  `cd trendist-front && npx esbuild <entry.ts> --bundle --format=iife --global-name=Game --outfile=…/game.bundle.js` 로 다시 만든다(entry는 두 파일을 export).
- `qr.svg`: trendist.kr QR(UTM 포함). `overview.mjs`: 16장 미리보기 생성.

## 다시 만들 때 필요한 것
Playwright 호환 Chromium(헤드리스), Noto Sans KR·Twemoji SVG·QR 라이브러리(npm: `@fontsource/noto-sans-kr`, `@twemoji/svg`, `qrcode`).
이 스크립트들은 만들 때의 임시 작업 폴더(`/tmp/pw/node_modules`)를 가리키므로, 다른 곳에서 쓰려면 `build.mjs`·`base.css`·`fonts.css`의 경로를 바꿔야 한다.
`fonts.css`와 이 폴더의 다른 경로(`file:///…`)도 이 PC 기준이다.

## 라이선스
Noto Sans KR: SIL OFL 1.1 / Twemoji 그래픽: CC-BY 4.0(캡션에 표기) / 로고·거북이: 서비스 자산.
