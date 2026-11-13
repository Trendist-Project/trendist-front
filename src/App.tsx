import { enterFullscreenOnStart } from './fullscreen';
import { useEffect, useRef, useState } from 'react';
import { adminApi, api, ApiFailure, resumeSession } from './api/client';
import { takeGoogleResult } from './googleAuth';
import type { PlayerSummary } from './api/types';
import { MainScreen } from './ui/MainScreen';
import { NicknameScreen } from './ui/NicknameScreen';
import { GameScreen } from './ui/GameScreen';
import { RestoreDialog } from './ui/RestoreDialog';
import { t, useLang } from './i18n';
import { getLang } from './country';

type Phase = { kind: 'main' } | { kind: 'nickname' } | { kind: 'game'; player: PlayerSummary; guest: boolean; key: number };

/** 정적 HTML은 한국어가 기본이라, 실행 중에 선택한 언어에 맞춰 제목·설명·OG 태그를 바꾼다(JS를 실행하는 크롤러·공유 미리보기용) */
function applySiteMeta() {
  const title = t('app.siteTitle'), desc = t('app.siteDesc');
  document.title = title;
  const set = (sel: string, v: string) => document.head.querySelector(sel)?.setAttribute('content', v);
  set('meta[name="description"]', desc);
  set('meta[property="og:title"]', title);
  set('meta[property="og:description"]', desc);
  set('meta[property="og:locale"]', getLang() === 'ko' ? 'ko_KR' : 'en_US');
  set('meta[property="og:image:alt"]', t('app.siteLogoAlt'));
  set('meta[name="twitter:title"]', title);
  set('meta[name="twitter:description"]', desc);
}

export function App() {
  const lang = useLang();
  useEffect(applySiteMeta, [lang]); // 나라가 바뀌면 다시 그린다(바꾸면 새로고침하지만 외부에서 바뀌어도 맞추기 위해)
  // 새로고침해도 항상 메인 화면부터 시작한다(3.1). 재방문 게스트는 [시작]을 누르면 쿠키의 방문자 ID로 같은 계정에 들어간다.
  const [phase, setPhase] = useState<Phase>({ kind: 'main' });
  const [error, setError] = useState<string | null>(null);
  // 메인 화면에서 이미 구글 계정으로 로그인한 상태인지(갱신 토큰). 맞으면 구글 버튼 없이 [시작]만 보여 준다. 확인 전에는 null
  const [account, setAccount] = useState<boolean | null>(null);
  // 로그인한 계정이 관리자인지. 시작 화면의 [관리자 페이지] 버튼은 이때만 보인다(서버 /api/me/admin이 판정)
  const [admin, setAdmin] = useState(false);
  const googlePending = useRef(false);
  // 탈퇴한 계정으로 구글 로그인했으면 복구할지 묻는다. 같은 ID 토큰으로 복구를 요청한다(4.1)
  const [restoreToken, setRestoreToken] = useState<{ idToken: string; nonce: string | null } | null>(null);

  /** 토큰이 있는 상태에서 플레이어 유무로 다음 화면을 정한다. */
  async function route() {
    const me = await api.me();
    setPhase(me.player ? { kind: 'game', player: me.player, guest: me.guest, key: Date.now() } : { kind: 'nickname' });
  }

  /** 로그인한 계정이면 관리자 여부를 확인해 시작 화면 버튼에 반영한다. 못 알아내면 관리자가 아닌 것으로 본다 */
  function refreshAdmin() {
    adminApi.status().then((s) => setAdmin(s.admin)).catch(() => setAdmin(false));
  }

  async function start() {
    enterFullscreenOnStart(); // 누르는 순간(제스처)에 켜야 허락된다. 모바일만, 컴퓨터는 켜지 않는다
    setError(null);
    try {
      // 로그인한 계정(갱신 토큰)이나 재방문 게스트(방문자 ID)면 그대로 이어 가고, 처음이면 새 게스트로 시작한다
      if (!(await resumeSession())) await api.startGuest();
      await route();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t('app.serverUnreachable'));
    }
  }

  // 구글 계정 선택을 마치고 돌아왔으면(9.3) 그 ID 토큰으로 로그인하고 시작 화면에 머문다(로그인한 상태로 [시작]·[로그아웃]이 보인다. 게임은 [시작]을 눌러야 들어간다).
  // 게스트로 하던 중이었다면 방문자 ID 쿠키로 그 기록에 연결된다
  useEffect(() => {
    const r = takeGoogleResult();
    if (!r) return;
    googlePending.current = true;
    if ('error' in r) {
      if (r.error !== 'access_denied') setError(t('app.googleLoginFailedRetry')); // 사용자가 취소한 경우는 조용히
      googlePending.current = false;
      setAccount(false);
      return;
    }
    api.googleLogin(r.idToken, r.nonce)
      .then((result) => {
        if (result === 'WITHDRAWN') { setRestoreToken({ idToken: r.idToken, nonce: r.nonce }); setAccount(false); return; }
        setAccount(true);
        refreshAdmin();
      })
      .catch((e) => { setError(e instanceof ApiFailure ? e.message : t('app.googleLoginFailed')); setAccount(false); })
      .finally(() => { googlePending.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase.kind !== 'main') return;
    // 구글 로그인에서 막 돌아와 처리하는 중이면 확인하지 않는다(갱신 토큰 회전과 겹치지 않게). 실패하면 그때 버튼을 보여 준다
    if (googlePending.current) return;
    let alive = true;
    setAccount(null);
    // 세션만 이어 보고(새 게스트 행은 만들지 않는다) 게스트가 아닌 계정이면 로그인한 상태로 본다
    resumeSession()
      .then((ok) => (ok ? api.me().then((me) => !me.guest) : false))
      .catch(() => false)
      .then((v) => { if (alive) { setAccount(v); if (v) refreshAdmin(); else setAdmin(false); } });
    return () => { alive = false; };
  }, [phase.kind]);

  // 브라우저 뒤로가기: 메인에서 [시작]으로 닉네임·게임 화면에 들어가면 히스토리를 한 칸 쌓아서, 뒤로가기를 누르면 사이트를 떠나지(예: 이전에 보던 구글 로그인 화면) 않고
  // 시작 화면으로 돌아온다. 새로고침하면 항상 메인부터라 남아 있던 기록은 먼저 지운다.
  useEffect(() => { if (history.state?.trendist) history.replaceState(null, ''); }, []);
  useEffect(() => {
    if (phase.kind === 'main') {
      if (history.state?.trendist) history.back(); // 로그아웃·탈퇴처럼 코드로 메인에 돌아왔으면 쌓아 둔 칸을 걷어 낸다
    } else if (history.state?.trendist) {
      history.replaceState({ trendist: phase.kind }, ''); // 닉네임 → 게임은 같은 칸을 쓴다
    } else {
      history.pushState({ trendist: phase.kind }, '');
    }
  }, [phase.kind]);
  useEffect(() => {
    const onPop = () => setPhase((p) => (p.kind === 'main' ? p : { kind: 'main' }));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  async function logout() {
    await api.logout().catch(() => { /* 서버에 못 닿아도 화면은 나간다 */ });
    setAdmin(false);
    setAccount(false); // 메인에서 로그아웃하면 단계가 그대로라 계정 확인이 다시 돌지 않으므로 직접 내린다
    setPhase({ kind: 'main' });
  }

  async function restore() {
    if (!restoreToken) return;
    await api.googleRestore(restoreToken.idToken, restoreToken.nonce);
    setRestoreToken(null);
    setAccount(true); // 복구한 뒤에도 시작 화면에 머문다
    refreshAdmin();
  }

  async function createPlayer(nickname: string) {
    const player = await api.createPlayer(nickname);
    const me = await api.me();
    setPhase({ kind: 'game', player, guest: me.guest, key: Date.now() });
  }

  switch (phase.kind) {
    case 'main':
      return (<>
        <MainScreen onStart={start} error={error} loggedIn={account} admin={admin} onLogout={logout} />
        {restoreToken && <RestoreDialog onRestore={restore} onCancel={() => setRestoreToken(null)} />}
      </>);
    case 'nickname':
      return <NicknameScreen onSubmit={createPlayer} />;
    case 'game':
      return <GameScreen key={phase.key} initialPlayer={phase.player} guest={phase.guest} onLogout={logout}
                         onWithdrawn={() => setPhase({ kind: 'main' })} />;
  }
}
