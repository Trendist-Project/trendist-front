import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { PlayerSummary } from '../api/types';
import { drawShareCard, type ShareCardData } from '../game/shareCard';
import { kakaoEnabled, sendKakao, uploadForKakao } from '../kakaoShare';
import { Modal } from './Modal';

interface Props { player: PlayerSummary; onBack(): void; onClose(): void }

const FILE_NAME = 'trendist-card.png';
const shareUrl = (ref = 'share') => `${window.location.origin}/?ref=${ref}`;

/** 카드에 넣을 값을 지금 있는 API에서 모은다. 하나가 실패해도 그 칸만 비우고 그린다 */
async function collect(player: PlayerSummary): Promise<ShareCardData> {
  const [titles, look, effects, history, rankings, keywords] = await Promise.all([
    api.titles().catch(() => null), api.myLook().catch(() => null), api.effects().catch(() => null),
    api.scoreHistory('7d').catch(() => null), api.rankings().catch(() => null), api.myKeywords().catch(() => null),
  ]);
  return {
    nickname: player.nickname,
    level: player.level,
    title: titles?.titles.find((t) => t.active)?.name ?? null,
    score: player.currentScore,
    rank: rankings?.find((r) => r.playerId === player.id)?.rank ?? null,
    scores: history?.points.map((p) => p.score) ?? [],
    // 💤 키워드는 "곧 뜰 것"을 알려 줄 수 있어 넣지 않는다(3.3)
    keywords: (keywords ?? []).filter((k) => k.state === '활성').sort((a, b) => b.trendValue - a.trendValue).slice(0, 3).map((k) => k.text),
    records: [
      ['누적 추가', `${player.totalPlusCount.toLocaleString()}회`],
      ['빼앗기', `${(player.stealCount ?? 0).toLocaleString()}회`],
      ['봇 사냥', `${(player.botWinCount ?? 0).toLocaleString()}회`],
      ['활동한 날', `${(player.activeDays ?? 0).toLocaleString()}일`],
    ],
    look: look?.look ?? { background: '#3fb68b', borderColor: null, borderWidth: null },
    trail: effects?.effects.find((e) => e.active)?.code ?? null,
    url: window.location.host,
  };
}

/**
 * 자랑하기 카드(4.24): 내 기록을 1080×1350 이미지로 만들어 공유한다. 이미지는 브라우저에서 그린다(서버 부담 없음).
 * [카카오톡 공유]는 카드를 카카오 서버에 미리 올려 두고 누르면 바로 카카오톡 공유 창을 연다(휴대폰·PC 모두).
 * 그 밖의 앱은 휴대폰 공유 시트로 보내고, 공유를 못 하는 브라우저는 이미지 저장과 링크 복사를 쓴다.
 */
export function ShareCardView({ player, onBack, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [canShareFile, setCanShareFile] = useState(false);
  // 카카오: null이면 준비 중, ''이면 실패(버튼 숨김), 주소면 준비됨
  const [kakaoImage, setKakaoImage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    collect(player).then(async (d) => {
      if (!alive || !canvasRef.current) return;
      await drawShareCard(canvasRef.current, d);
      if (!alive) return;
      setReady(true);
      // 파일 공유가 되는 브라우저인지 미리 본다(데스크톱 대부분은 안 된다)
      const probe = new File([new Blob()], FILE_NAME, { type: 'image/png' });
      setCanShareFile(!!navigator.canShare?.({ files: [probe] }));
      if (kakaoEnabled) {
        const blob = await new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob(resolve, 'image/png') ?? resolve(null));
        const url = blob ? await uploadForKakao(new File([blob], FILE_NAME, { type: 'image/png' })).catch(() => '') : '';
        if (alive) setKakaoImage(url);
      }
    }).catch(() => { if (alive) setMessage({ text: '카드를 만들지 못했어요', error: true }); });
    return () => { alive = false; };
  }, [player]);

  const toBlob = () => new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob(resolve, 'image/png') ?? resolve(null));

  async function share() {
    setMessage(null);
    const blob = await toBlob();
    if (!blob) return;
    try {
      await navigator.share({
        files: [new File([blob], FILE_NAME, { type: 'image/png' })],
        title: 'Trendist', text: `내 유행도 ${player.currentScore.toLocaleString()}! 나랑 겨뤄 볼래?`, url: shareUrl(),
      });
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') setMessage({ text: '공유하지 못했어요. 이미지 저장을 써 주세요', error: true });
    }
  }

  function kakao() {
    if (!kakaoImage) return;
    try {
      sendKakao({
        imageUrl: kakaoImage, url: shareUrl('kakao'),
        title: `${player.nickname}의 트렌드 성적표`,
        description: `유행도 ${player.currentScore.toLocaleString()} · ${player.level}레벨. 유행을 아는 자, 커진다!`,
      });
    } catch {
      setMessage({ text: '카카오톡 공유 창을 열지 못했어요. 이미지 저장을 써 주세요', error: true });
    }
  }

  async function save() {
    setMessage(null);
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = FILE_NAME;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ text: '이미지를 저장했어요', error: false });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setMessage({ text: '링크를 복사했어요', error: false });
    } catch {
      setMessage({ text: shareUrl(), error: false });
    }
  }

  return (
    <Modal title="📸 자랑하기 카드" onClose={onClose} className="share-card-modal" titleExtra={<button className="link-back" onClick={onBack}>‹ 내 정보</button>}>
      <div className="share-card-frame">
        <canvas ref={canvasRef} className={ready ? 'share-card-canvas' : 'share-card-canvas loading'} aria-label="내 기록 카드 이미지" />
        {!ready && !message?.error && <span className="share-card-loading muted small">카드를 만드는 중…</span>}
      </div>
      <p className="muted small">내 유행도·칭호·가진 🔥 키워드·기록을 한 장에 담았어요. 💤 키워드는 넣지 않아요.</p>
      {message && <p className={message.error ? 'error small' : 'ok small'} role="status">{message.text}</p>}
      <div className="share-card-actions">
        {kakaoEnabled && kakaoImage !== '' && (
          <button className="kakao-share" onClick={kakao} disabled={!kakaoImage}>
            <span aria-hidden="true">💬</span>{kakaoImage ? '카카오톡 공유' : '카카오톡 준비 중…'}
          </button>
        )}
        {canShareFile && <button className={kakaoEnabled ? '' : 'primary'} onClick={share} disabled={!ready}>📤 {kakaoEnabled ? '다른 앱으로 공유' : '공유하기'}</button>}
        <button className={canShareFile || kakaoEnabled ? '' : 'primary'} onClick={save} disabled={!ready}>⬇️ 이미지 저장</button>
        <button onClick={copyLink}>🔗 링크 복사</button>
      </div>
    </Modal>
  );
}
