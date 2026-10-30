# 로고

- `logo/logo.jpg`: 지금 쓰는 메인 로고 원본(1024×1024, 흰 바탕).
- `logo/trendist_logo3·4·5·7.jpg`: 예비 로고 원본.

사이트에 쓰는 파일은 원본에서 만들어 `public/`에 둔다. 흰 바탕 원본은 어두운 화면에서 사각형으로 보이므로, 로고 둘레를 원으로 잘라 바깥을 투명하게 한다.

| 파일 | 크기 | 쓰는 곳 |
|---|---|---|
| `public/logo.png` | 256×256 | 메인 화면 제목 위 |
| `public/favicon.ico` | 16·32·48 | 브라우저 탭(게임, 관리자) |
| `public/favicon.png` | 64×64 | 브라우저 탭(PNG를 쓰는 브라우저) |
| `public/apple-touch-icon.png` | 180×180, 흰 바탕 사각형 | iOS 홈 화면 |
| `public/icon-192.png` | 192×192 | 링크 미리보기(`og:image`) |

로고를 바꾸면 `logo/logo.jpg`를 교체하고 위 파일들을 다시 만든다.
