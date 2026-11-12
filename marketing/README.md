# 홍보(marketing)

Trendist 홍보용 자료와 기획이 있는 폴더다. 지금은 인스타그램만 있다.

```
marketing/
├─ README.md                      이 문서: 폴더 안내 + 패치노트 피드 양식 + 다음에 시킬 때 쓰는 요청 양식
└─ instagram/
   ├─ plan.md                     런칭 기획서(캐러셀 4개 피드, 운영 캘린더, KPI, 리스크)
   ├─ feed1-launch/ … feed4-quiz/ 런칭용 캐러셀 이미지 16장
   ├─ patch-notes/                ★ 패치노트 피드(사진 1장 + 캡션 1개가 한 피드). feeds.md에 캡션이 모여 있다
   └─ _src/                       이미지를 만드는 소스(HTML·스크립트). patch.mjs가 패치노트 피드를 만든다
```

## 1. 패치노트 피드 전략(2026-11-12 결정)

- **피드 1개 = 사진 1장 + 캡션 1개.** 캐러셀을 쓰지 않는다. 사진 한 장에 게임의 핵심 내용 **하나** 또는 사용자에게 와닿는 패치 내용 **하나**만 담는다.
- 모든 사진은 **같은 템플릿**을 쓴다(아래 2절). 기준 양식은 `instagram/feed2-turtle/04-cta.png`다.
- 소재는 **백엔드 저장소의 커밋 로그와 `docs/README.md` 변경 이력**(판 번호별 "무엇이 바뀌었나")에서 고른다. 관리자 기능·내부 리팩터링은 빼고, 플레이어가 화면에서 체감하는 것만 고른다.
- 올리는 순서는 `patch-notes/feeds.md`의 번호순이 기본이다: 새 기능 → 전투 규칙 → 스킬 → 핵심 규칙 → 수집 요소(칭호·꾸미기·자랑하기) → 알아 두기(봇·모바일·서버).
- 캡션 규칙은 `plan.md` 4절과 같다: 첫 줄 훅 → 혜택·규칙 2~4줄 → 행동 한 가지(QR/프로필 링크) → Twemoji 출처 → 해시태그. 해요체, 과장 표현 금지.
- 해시태그는 두 줄이다: `#게임 #게임추천 #트랜드 #이슈 #트렌디스트` + 게시물별 태그 2~4개(같은 줄), 다음 줄에 `#game #trend #issue #trendist`(`patch.mjs`의 `TAGS`·`TAGS_EN`).
- 이미지의 QR은 `https://trendist.kr/?utm_source=instagram&utm_medium=feed&utm_campaign=patch`다(`_src/qr-patch.svg`). 피드별로 따로 추적하고 싶으면 QR을 새로 만들어 `QR_PATCH`를 바꾼다.
- 수치(쿨타임·해금 레벨·확률 등)는 **운영 설정으로 바뀔 수 있다**. 올리기 전에 지금 값과 맞는지 한 번 확인한다(`trendist-back/docs/1-planning.md`의 해당 절).

## 2. 템플릿(사진 한 장의 구성)

`_src/patch.mjs`의 `slide()`가 만드는 틀이다. 1080×1350(4:5).

| 자리 | 내용 | 비고 |
|---|---|---|
| 왼쪽 위 | 로고 + **Trendist** | 고정 |
| 위 가운데 | 분류 알약(🆕 새 기능 / ⚔️ 핵심 규칙 / 스킬 / 개선 / 수집) | `kind`: new · rule · skill · fix · fun |
| 제목 | 2줄, 둘째 줄에 강조색 | 한 줄 11자 이내 |
| 그림 | 게임 그리기 코드(거북이·스킬 연출) 또는 HTML 카드 | `visual` + `script` |
| 설명 | 2줄 | 굵게(`<b>`)는 흰색 |
| **아래** | **QR + trendist.kr + "설치 없이 · 가입 없이 · 바로 시작"** | 기본 양식(04-cta와 같은 크기). 내용이 많으면 **작게(compact) 더 아래로** 내린다 |
| 맨 아래 | `#게임 #게임추천 #트랜드 #이슈` | 고정 |

- QR 블록은 **내용이 아래에 닿으면 자동으로 작아져 내려가고**, 그래도 모자라면 그림을 줄인다. 내용이 짧으면 내용을 조금 내려 가운데에 가깝게 둔다(`_src/build.mjs`의 `FIT`). 직접 정하려면 `compact: true`.
- 이모지는 HTML에서는 `E('코드포인트')`(Twemoji 그림), 캔버스 글자에서는 `lib.js`의 `EMO` 표에 있는 것만 그려진다(없으면 네모로 깨진다. 표에 더한다).

## 3. 다시 만들기 / 새 피드 더하기

```bash
cd trendist-front/marketing/instagram/_src
npm install            # 처음 한 번(폰트·Twemoji·Playwright·QR). node_modules는 git 제외
npm run build:patch    # patch-notes/YYYY-MM-DD-xxx.png 22장과 feeds.md를 다시 만든다(약 30초)
```

- 크로미엄은 Playwright가 `~/.cache/ms-playwright`에 받아 둔 것을 쓴다. 없으면 `npx playwright-core install chromium-headless-shell`.
- 크로미엄이 `libnss3.so` 등을 못 찾으면 `sudo apt install libnss3 libnspr4`가 정답이다. sudo가 안 되면 `apt-get download libnss3 libnspr4` → `dpkg-deb -x` 로 꺼낸 `.so` 파일들을 `_src/.libs/`에 두면 `build.mjs`가 알아서 쓴다(git 제외, 각 PC에서 만든다).
- 새 피드는 `patch.mjs`의 `feeds.push({ file, caption, slide: slide({...}) })` 한 덩어리를 더하고 다시 실행한다. **이미지와 캡션이 한곳에** 있어서 feeds.md는 손으로 고치지 않는다.
- 피드마다 `post: 'YYYY-MM-DD'`(인스타그램 예약 게시일)와 `file: '내용slug'`를 적는다. **PNG 이름은 `게시일-내용.png`**(예: `2026-11-13-mobile.png`)이고 feeds.md도 게시일 순이다. 메모가 있으면 `note`. 날짜를 바꾸면 파일 이름이 바뀌므로 옛 PNG는 지운다. 안 쓰기로 한 피드는 `feeds.push` 덩어리를 지우고 PNG도 지운다(봇, GLOBAL은 2026-11-13에 뺐다).
- 지금 일정: 2026-11-13 18:00 모바일을 시작으로 **하루 1개씩** 이어지고(11-14 자랑하기 카드 → … → 12-01 체력), 12-02 보스·보스 보상(한 게시물), 12-03 돌림판이 마지막이다.
- 게임 그리기 코드가 바뀌어(거북이·스킬 연출) 그림을 맞춰야 하면 `_src/README.md`대로 `game.bundle.js`를 다시 만든다.

## 4. 다음에 시킬 때 쓰는 요청 양식

이 양식으로 요청하면 같은 템플릿으로 피드를 더 만든다.

```
패치노트 피드 추가해 줘.
- 기준: 백엔드 커밋 NNN판~MMM판(또는 날짜 YYYY-MM-DD 이후) 중 사용자에게 와닿는 것
- 개수: N개 (각 1장 + 캡션)
- 번호: #25부터 이어서
- 꼭 넣을 소재: (있으면) 예) 새 보스, 새 스킬 …
- 빼고 싶은 소재: (있으면) 예) 관리자 기능, 성능 개선 …
- 특이 사항: (있으면) 예) 이번엔 QR을 작게(compact)로 통일 / 이벤트 날짜 넣기 …
```

만드는 쪽 체크리스트(요청을 받으면 이 순서로 한다)
1. `trendist-back` 커밋 로그와 `docs/README.md` 변경 이력에서 소재를 뽑고, 규칙 수치는 `docs/1-planning.md` 해당 절에서 확인한다.
2. `patch.mjs`에 피드를 더한다(`post` 게시일 + `file` 영문 slug). 제목 2줄·설명 2줄·캡션을 함께 쓴다.
3. `npm run build:patch`로 만들고 **이미지를 전부 눈으로 확인**한다(글자 넘침, 깨진 이모지, QR 겹침).
4. `feeds.md`가 갱신됐는지 보고, 이 README의 전략·양식이 바뀌었으면 같이 고친다.

## 5. 게시 체크리스트(피드 1개마다)

- [ ] 이미지의 수치가 지금 운영 값과 같은가(쿨타임·해금 레벨·확률·보상)
- [ ] 캡션 끝에 Twemoji 출처(CC-BY 4.0)와 해시태그가 있는가
- [ ] 프로필 링크(UTM)와 QR이 살아 있는가
- [ ] 게시 뒤 1시간 안에 댓글 응대가 가능한 시간인가(응대 문구는 `plan.md` 9절)
- [ ] 스토리에 공유 + 고정 댓글("링크는 프로필 상단에 있어요 👆 설치 없이 바로 시작!")
