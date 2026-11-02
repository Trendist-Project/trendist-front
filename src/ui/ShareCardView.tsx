import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { PlayerSummary, ShareCardCreated } from '../api/types';
import { kakaoEnabled, prepareKakao, sendKakaoLink } from '../kakaoShare';
import { Modal } from './Modal';
import { successToast } from './toast';

interface Props { player: PlayerSummary; onBack(): void; onClose(): void }

const FILE_NAME = 'trendist-card.png';
/** 서버 주소(절대)에서 경로만 쓴다. 이미지는 지금 접속한 사이트에서 받는다(로컬 개발 서버 프록시 포함) */
const pathOf = (url: string) => { const u = new URL(url); return u.pathname + u.search; };

/**
 * 자랑하기 카드(4.24): 카드를 여는 순간 서버가 지금 값을 저장하고 공유 주소(/share/{코드})를 만든다.
 * 버튼은 세 개: [카카오톡 공유](카드 주소만 카카오톡으로), [이미지 저장], [링크 복사](카드 주소).
 * 주소를 미리 만들어 두는 이유는 누른 뒤 기다리면 PC 브라우저가 공유 창을 팝업으로 막기 때문이다.
 */
export function ShareCardView({ player, onBack, onClose }: Props) {
  const [card, setCard] = useState<ShareCardCreated | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  // 카카오: null이면 준비 중, false면 쓸 수 없음(카드 공유는 공유 시트·복사로), true면 준비됨
  const [kakaoReady, setKakaoReady] = useState<boolean | null>(kakaoEnabled ? null : false);
  const [ready, setReady] = useState(false);
  // 카드 PNG 파일. 저장 버튼에서 받으면 기다리는 사이 클릭 효력이 끝나므로 미리 받아 둔다
  const fileRef = useRef<File | null>(null);

  useEffect(() => {
    let alive = true;
    if (kakaoEnabled) prepareKakao().then(() => alive && setKakaoReady(true), () => alive && setKakaoReady(false));
    (async () => {
      const c = await api.createShareCard();
      if (!alive) return;
      setCard(c);
      const res = await fetch(pathOf(c.imageUrl));
      if (!res.ok) throw new Error('NO_IMAGE');
      const file = new File([await res.blob()], FILE_NAME, { type: 'image/png' });
      if (!alive) return;
      fileRef.current = file;
      setReady(true);
    })().catch((e) => {
      if (!alive) return;
      const tooFast = (e as { code?: string })?.code === 'SHARE_TOO_FAST';
      setMessage({ text: tooFast ? '잠시 후 다시 열어 주세요' : '카드를 만들지 못했어요', error: true });
    });
    return () => { alive = false; };
  }, [player]);

  async function copyLink() {
    if (!card) return;
    setMessage(null);
    try {
      await navigator.clipboard.writeText(card.url);
      successToast('카드 링크를 복사했어요');
    } catch {
      // 클립보드를 쓸 수 없는 브라우저(권한·http 주소)에서는 주소를 보여 줘서 직접 복사하게 한다
      setMessage({ text: card.url, error: false });
    }
  }

  /** 휴대폰 공유 시트, 없으면 주소 복사(카카오톡을 쓸 수 없을 때 카드 공유) */
  async function shareOrCopy(url: string, text: string, copied: string) {
    setMessage(null);
    if (navigator.share) {
      try { await navigator.share({ title: 'Trendist', text, url }); return; } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      successToast(copied);
    } catch {
      setMessage({ text: url, error: false });
    }
  }

  function shareCard() {
    if (!card) return;
    if (kakaoReady) {
      try {
        sendKakaoLink(card.url, `${player.nickname}의 트렌드 성적표 · 유행도 ${player.currentScore.toLocaleString()}\n${card.url}`);
        return;
      } catch { /* 아래 공유 시트로 */ }
    }
    void shareOrCopy(card.url, `내 유행도 ${player.currentScore.toLocaleString()}! 나랑 겨뤄 볼래?`, '카드 링크를 복사했어요');
  }

  function save() {
    setMessage(null);
    const file = fileRef.current;
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = FILE_NAME;
    document.body.appendChild(a); // 문서에 붙어 있어야 클릭으로 내려받는 브라우저가 있다
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    successToast('이미지를 저장했어요');
  }

  const stats = card && card.totalViews > 0
    ? `내 카드를 지금까지 ${card.totalViews.toLocaleString()}명이 봤고${card.totalPlays > 0 ? ` ${card.totalPlays.toLocaleString()}명이 게임에 들어왔어요` : '어요'}`
    : null;

  return (
    <Modal title="📸 자랑하기 카드" onClose={onClose} className="share-card-modal" titleExtra={<button className="link-back" onClick={onBack}>‹ 내 정보</button>}>
      <div className="share-card-frame">
        {card
          ? <img src={pathOf(card.imageUrl)} className="share-card-canvas" width={1080} height={1350} alt="내 기록 카드 이미지" />
          : <div className="share-card-canvas loading" aria-hidden="true" />}
        {!card && !message?.error && <span className="share-card-loading muted small">카드를 만드는 중…</span>}
      </div>
      {stats && <p className="share-card-stats small">👀 {stats}</p>}
      {message && <p className={message.error ? 'error small' : 'ok small'} role="status">{message.text}</p>}
      <div className="share-card-actions">
        {kakaoEnabled && kakaoReady !== false
          ? <button className="kakao-share" onClick={shareCard} disabled={!kakaoReady || !card}>
              <span aria-hidden="true">💬</span>{kakaoReady ? '카카오톡 공유' : '카카오톡 준비 중…'}
            </button>
          : <button className="primary" onClick={shareCard} disabled={!card}>📤 카드 공유</button>}
        <button onClick={save} disabled={!ready}>⬇️ 이미지 저장</button>
        <button onClick={copyLink} disabled={!card}>🔗 링크 복사</button>
      </div>
    </Modal>
  );
}
