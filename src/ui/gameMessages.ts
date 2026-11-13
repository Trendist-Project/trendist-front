import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { EmergencyNotice, PlayerSummary } from '../api/types';
import type { Arena } from '../game/Arena';
import type { GameConnection } from '../game/connection';
import { isPartLoss, type ChatMessage, type LossCause, type ServerMessage } from '../game/protocol';
import { setCurrentSlots } from '../game/skillKeys';
import { normalizeFxId, normalizeSkillCode } from '../game/skills';
import { getLang } from '../country';
import { t } from '../i18n';
import type { ChatLine } from './ChatPanel';
import type { MonsterNote } from './MonsterHud';
import { ORB_REVEAL_MS, type RevealResult } from './OrbReveal';
import type { DashState, SkillCooldowns } from './SkillBar';
import { handleSelfStatus, type SkillLock } from './selfStatusMessages';

/**
 * 서버가 보낸 게임 메시지(protocol.ts의 ServerMessage)를 화면 상태와 아레나에 반영한다(8절). GameScreen의 연결 이펙트가 메시지마다 부른다.
 * 화면 상태는 React setter로, 그림은 Arena로 넘긴다. 이 파일은 상태를 들고 있지 않고 GameMessageContext로 받은 것만 쓴다.
 */

/** 화면에 쌓아 두는 채팅 줄 수 */
export const CHAT_KEEP = 200;

/** 연결 하나 동안 이펙트 안에서 바뀌는 값: 방에 들어갔는지(welcome 뒤 끊기기 전까지), 내 원 번호, 누르고 있는 방향키를 다시 보내는 함수 */
export interface GameSession { ready: boolean; myEntity: number; resyncDir: () => void }

type Set<T> = Dispatch<SetStateAction<T>>;
/** 화면의 상태 모양(GameScreen의 useState와 같다) */
export interface MyHp { pct: number; flash: { kind: 'hit' | 'heal'; key: number } | null }
export interface DeadState { by: string; waiting: boolean; hp?: boolean }
export interface MyCombo { combo: number; flameAt: number; key: number; until: number | null }

export interface GameMessageContext {
  arena: Arena;
  conn: GameConnection;
  sess: GameSession;
  skillLock: SkillLock;
  toLine: (m: ChatMessage) => ChatLine;
  hookedUntilRef: MutableRefObject<number>;
  myEntityRef: MutableRefObject<number>;
  showReveal: (r: RevealResult) => void;
  showTitleAlert: (titleId: number, name: string, description: string) => void;
  showToast: (msg: string) => void;
  applyEmergency: (n: EmergencyNotice | null) => void;
  setPlayer: Set<PlayerSummary>;
  setOnline: Set<number>;
  setBots: Set<number>;
  setMonsterNote: Set<MonsterNote | null>;
  setMyBossDmg: Set<{ dmg: number; hits: number }>;
  setKicked: Set<string | null>;
  setMyHp: Set<MyHp>;
  setDead: Set<DeadState | null>;
  setMyCombo: Set<MyCombo>;
  setHit: Set<{ text: string; key: number } | null>;
  setDash: Set<DashState | null>;
  setSkillCd: Set<SkillCooldowns>;
  setHookedUntil: Set<number | null>;
  setSlots: Set<(string | null)[]>;
  setRefreshKey: Set<number>;
  setOrbReveal: Set<{ result: RevealResult; key: number } | null>;
  setPingMs: Set<number | null>;
  setChatLines: Set<ChatLine[]>;
}

/** 아무도 가져가지 않고 여러 개를 잃을 수 있는 스킬의 결과 카드 제목(독은 카드의 기본 제목) */
const LOST_TITLE: Partial<Record<LossCause, string>> = { quake: 'gamescreen.quakeLostTitle', fireball: 'gamescreen.fireballLostTitle' };

export function handleGameMessage(m: ServerMessage, c: GameMessageContext) {
  const { arena, conn, sess, skillLock, toLine, hookedUntilRef, myEntityRef, showReveal, showTitleAlert, showToast, applyEmergency, setPlayer, setOnline, setBots, setMonsterNote, setMyBossDmg, setKicked, setMyHp, setDead, setMyCombo, setHit, setDash, setSkillCd, setHookedUntil, setSlots, setRefreshKey, setOrbReveal, setPingMs, setChatLines } = c;
  switch (m.type) {
    case 'welcome':
      setDead(null); arena.setDead(false); // 처음 들어왔거나 리스폰했다
      setDash(null); arena.resetDash(); // 새 원이라 대시 남은 시간·쿨타임 표시도 지운다(서버는 이미 초기화)
      setSkillCd({}); arena.resetSkills(); hookedUntilRef.current = 0; setHookedUntil(null); // 스킬 쿨타임과 연출도(4.33)
      arena.setMe(m.entityNo, m.x, m.y);
      arena.resendView(); // 다시 들어왔으니 보이는 범위를 서버에 다시 알린다
      sess.myEntity = m.entityNo;
      myEntityRef.current = m.entityNo;
      sess.ready = true;
      sess.resyncDir(); // 다시 연결됐을 때 아직 누르고 있는 방향키가 있으면 서버와 예측에 함께 다시 넣는다
      conn.send({ type: 'ping', t: performance.now() });
      break;
    case 'monster': arena.setMonster(m); break; // 보스 상태(5Hz, 4.35)
    case 'monsterFx': arena.monsterFx(m); break;
    case 'monsterAlert': showToast(t('monster.alert', { name: getLang() === 'en' && m.en ? m.en : m.name, sec: Math.max(1, Math.round(m.seconds)) })); break;
    case 'monsterSpawn':
      setMyBossDmg({ dmg: 0, hits: 0 }); setMonsterNote(null);
      showToast(t('monster.spawn', { name: getLang() === 'en' && m.en ? m.en : m.name, min: Math.max(1, Math.round(m.durationMs / 60000)) }));
      break;
    case 'monsterHit':
      arena.monsterHit(m);
      if (m.e === sess.myEntity) { // 내가 입힌 피해는 보스 위 숫자로만 보인다(내 원 위 글씨는 중복이라 뺐다)
        setMyBossDmg((d) => ({ dmg: d.dmg + m.dmg, hits: d.hits + 1 }));
      }
      break;
    case 'monsterEnd':
      if (m.result === 'KILLED') arena.vanishMonster(); else arena.clearMonster(); // 처치하면 증발 연출, 시간이 다 되면 그냥 사라진다
      setMonsterNote({ key: performance.now(), kind: 'end', result: m.result, name: m.name, en: m.en, top: m.top });
      window.setTimeout(() => setMonsterNote((n) => (n && n.kind === 'end' ? null : n)), 12000);
      break;
    case 'monsterReward':
      setMonsterNote({ key: performance.now(), kind: 'reward', name: m.name, en: m.en, cleared: m.cleared, rank: m.rank, damage: m.damage, exp: m.exp, levelPercent: m.levelPercent ?? 0, keywords: m.keywords });
      window.setTimeout(() => setMonsterNote((n) => (n && n.kind === 'reward' ? null : n)), 15000);
      setRefreshKey((k) => k + 1);
      break;
    case 'tuning': arena.setTuning(m); break;
    case 'emergency': applyEmergency(m.notice); break;
    case 'titleGranted': showTitleAlert(m.titleId, m.name, m.description); break;
    case 'roster': arena.setRoster(m.players, m.flameAt); setOnline(m.players.filter((p) => !p.bot).length); setBots(m.players.filter((p) => p.bot).length); break;
    case 'score':
      setPlayer((p) => ({ ...p, currentScore: m.score, exp: m.exp, nextLevelExp: m.nextExp, level: m.level, holdCount: m.holdCount }));
      break;
    case 'pong': {
      const ms = performance.now() - m.t;
      arena.updateRtt(ms);
      if (Number.isFinite(ms) && ms >= 0 && ms < 5000) setPingMs((p) => (p === null ? Math.round(ms) : Math.round(p * 0.6 + ms * 0.4))); // 튀는 값에 깜빡이지 않게 조금씩 따라간다
      break;
    }
    case 'orbs': arena.setOrbs(m.orbs); break;
    case 'orbSpawn': arena.addOrb(m.id, m.x, m.y, m.prize); break;
    case 'orbEaten': arena.eatOrb(m.id, m.e); break;
    case 'safeZones': arena.setSafeZones(m.center, m.zones); break;
    case 'orbResult': {
      // 구슬이 원 안으로 빨려 들어간 뒤에 결과 카드를 띄운다
      const key = performance.now();
      const kind = m.status === 'GAINED' || m.status === 'RENEWED' ? 'GAIN' : m.status === 'LOST' ? 'LOSE' : undefined;
      window.setTimeout(() => setOrbReveal({ result: { ...m, kind }, key }), 250);
      window.setTimeout(() => setOrbReveal((cur) => (cur?.key === key ? null : cur)), 250 + ORB_REVEAL_MS);
      if (m.status === 'GAINED') arena.floatText(`+${m.gained ?? 0}`);
      if (m.status === 'LOST' && m.gained) arena.floatText(`-${m.gained}`);
      if (m.status === 'GAINED' || m.status === 'RENEWED' || m.status === 'LOST') setRefreshKey((k) => k + 1); // 보관함 목록 새로고침(새 키워드, 또는 바뀐 만료 시각)
      break;
    }
    case 'chat':
      arena.showBubble(m.e, m.text);
      setChatLines((lines) => [...lines, toLine(m)].slice(-CHAT_KEEP));
      break;
    case 'chatHistory':
      // 다시 연결되면 최근 채팅이 다시 오므로 번호로 합친다
      setChatLines((lines) => {
        const seen = new Set(lines.map((l) => l.id));
        return [...lines, ...m.messages.filter((x) => !seen.has(x.id)).map(toLine)].sort((a, b) => a.id - b.id).slice(-CHAT_KEEP);
      });
      break;
    case 'chatError': showToast(m.message); break;
    case 'kicked': conn.stop(); setKicked(m.message); break;
    case 'emote': arena.showEmote(m.e, m.code); break;
    case 'combo': {
      // 연속 빼앗기 콤보와 불꽃(4.25). 콤보 수는 화면 위 카드로만 보이고, 원 위로 떠오르는 글자는 띄우지 않는다(점수 글자와 겹치지 않게)
      arena.setCombo(m.e, m.combo, m.flameAt);
      const mine = m.e === sess.myEntity;
      if (mine) {
        // 콤보가 오를 때마다 유지시간이 다시 시작되므로(4.25) 그때 사라질 시각을 새로 잡는다
        const rose = m.event === 'up' || m.event === 'start';
        setMyCombo((c) => ({ combo: m.combo, flameAt: m.flameAt, key: c.key + (rose ? 1 : 0),
          until: rose ? (m.maxMs ? performance.now() + m.maxMs : null) : c.until }));
      }
      // 다른 사람이 불꽃을 얻었다는 안내는 띄우지 않는다(불꽃은 그 원 둘레로 보인다)
      if (m.event === 'broken') {
        if (mine) showToast(t('gamescreen.flameOut', { by: m.by ?? t('gamescreen.someone') }));
      }
      break;
    }
    case 'lost': {
      // 어떤 키워드를 몇 점짜리로 잃었는지 보여 준다(4.3). 원인은 cause 하나로 고른다(서버 LossMessages)
      const who = m.by || undefined;
      if (isPartLoss(m.cause)) showReveal({ type: 'orbResult', status: 'LOST', wipe: m.count, who, lostLabel: t(m.cause === 'death' ? 'gamescreen.lostPartDeath' : 'gamescreen.lostPartFlame') }); // 일부를 잃었다(4.36)
      else showReveal({ type: 'orbResult', status: 'LOST', text: m.keyword ?? '', gained: m.score, kind: m.stolen ? 'STOLEN' : 'LOSE', who, lostCount: m.count, lostLabel: LOST_TITLE[m.cause] && t(LOST_TITLE[m.cause]!) }); // 아무도 가져가지 않은 것은 '뺏김'이 아니라 '잃음'
      if (m.score > 0) arena.floatText(`-${m.score}`, '#ff8a8a');
      setRefreshKey((k) => k + 1);
      break;
    }
    case 'hit': {
      // 공격 성공: 상대가 잃은 키워드와 점수를 내 화면에 보여 준다.
      // 사람에게서 이기면 그 키워드를 빼앗는다: 없던 키워드는 보관함에 추가, 이미 있던 키워드는 남은 시간 갱신(4.3)
      // 봇을 이기면 봇이 잃은 그 키워드를 얻는다. 이미 가진 키워드면 남은 시간 갱신(4.21)
      const key = performance.now();
      const part = isPartLoss(m.cause);
      const hp = { target: m.target ?? '', kw: m.keyword ?? '', score: m.score ?? 0, n: m.count ?? 0 };
      const gainedBy = !!m.stolen; // 키워드를 얻었다(빼앗음·봇을 이겨 획득): 구슬과 같은 결과 카드로 보여 준다
      if (gainedBy) {
        showReveal({ type: 'orbResult', status: m.stolen === 'ADDED' || m.stolen === 'BOT' ? 'GAINED' : 'RENEWED', text: m.keyword ?? '', gained: m.gained,
                     kind: 'STEAL', who: m.target || undefined });
      }
      const text = part ? t('gamescreen.hitPart', hp)
        : m.stolen === 'BOT' ? t('gamescreen.hitBot', hp)
        : m.stolen === 'BOT_RENEWED' ? t('gamescreen.hitBotRenewed', hp)
        : m.stolen === 'ADDED' ? t('gamescreen.hitAdded', hp)
        : m.stolen === 'RENEWED' ? t('gamescreen.hitRenewed', hp)
        : m.keyword ? t('gamescreen.hitDropped', hp) : t('gamescreen.hitWon', hp);
      if (part) showReveal({ type: 'orbResult', status: 'GAINED', wipe: m.count, who: m.target || undefined, lostLabel: t('gamescreen.hitPartTitle') });
      else if (!gainedBy) setHit({ text, key });
      if (m.stolen) {
        if (m.gained) arena.floatText(`+${m.gained}`);
        setRefreshKey((k) => k + 1); // 보관함 목록 새로고침
      }
      if (!gainedBy && !part) window.setTimeout(() => setHit((h) => (h?.key === key ? null : h)), 3000);
      break;
    }
    case 'died':
      // 죽음(4.31): 입력을 끊고 마지막 장면을 흑백으로 두며, 누가 죽였는지 알려 준다
      sess.ready = false; arena.clearControl();
      setDead({ by: m.by, waiting: false, hp: m.cause === 'hp' }); arena.setDead(true);
      arena.clearHp(); setMyHp({ pct: 100, flash: null }); // 다시 들어오면 체력은 가득이다(4.36)
      break;
    case 'hp': { // 내 체력(4.36)
      if (sess.myEntity !== -1 && m.e !== sess.myEntity) break; // hp는 본인에게만 온다. 접속 직후엔 welcome보다 먼저 와서 myEntity가 아직 -1이니 버리면 안 된다
      arena.setHp(m.e, m.pct);
      setMyHp((h) => ({ pct: m.pct, flash: m.heal ? { kind: 'heal', key: performance.now() } : h.flash }));
      if (m.heal) arena.healPop(m.e);
      break;
    }
    case 'hps': arena.setHps(m.list); break; // 체력바 공개 설정일 때 모두의 체력
    case 'hpHit': { // 누가 맞았다: 그 원 위에 깎인 %를 띄운다. 내 체력바는 바로 줄인다
      arena.hpPop(m.e, `-${Math.max(1, m.pct > 0 ? Math.min(99, Math.round(m.dmg)) : Math.round(m.dmg))}%`, m.e === sess.myEntity ? 'taken' : arena.isFlaming(m.by) ? 'crit' : 'other'); // 내가 입은 피해는 보라, 불꽃으로 때린 피해는 분홍 크리티컬, 나머지는 주황
      if (m.e === sess.myEntity) {
        arena.setHp(m.e, m.pct);
        setMyHp({ pct: m.pct, flash: { kind: 'hit', key: performance.now() } });
      }
      break;
    }
    case 'kill': { // 내가 죽였다(4.31)
      showReveal({ type: 'orbResult', status: 'GAINED', kill: m.target });
      break;
    }
    case 'shield': arena.showShield(m.e, m.ms); break;
    case 'knock': arena.applyKnock(m.dx, m.dy, m.ms); break;
    case 'levelFx': arena.showLevelFx(m.e, m.level); break; // 레벨업 이펙트(4.30)
    case 'dashFx': arena.showDashFx(m.e, m.ms); break; // 누군가 대시를 시작했다: 그 원에 강조 효과(4.27)
    case 'skill': { // 내가 스킬을 썼다(4.33): 쿨타임 표시
      const at = performance.now() + m.cooldownMs;
      setSkillCd((c) => ({ ...c, [normalizeSkillCode(m.id)]: at }));
      break;
    }
    case 'cooldowns': { // 새로고침하고 다시 들어왔다: 서버가 들고 있는 스킬·대시 쿨타임을 다시 보여 준다(welcome 뒤에 온다)
      const t0 = performance.now();
      setSkillCd(Object.fromEntries(Object.entries(m.skills).map(([id, ms]) => [normalizeSkillCode(id), t0 + ms])));
      if (m.dashReadyMs > 0) {
        setDash({ until: t0 + m.dashActiveMs, readyAt: t0 + m.dashReadyMs });
        if (m.dashActiveMs > 0) arena.startDash(m.dashActiveMs, m.dashMult);
      }
      break;
    }
    case 'loadout': { const slots = m.slots.map(normalizeSkillCode); setSlots(slots); setCurrentSlots(slots); break; } // 장착한 스킬 4칸(4.33)
    case 'skillFx': arena.showSkillFx(normalizeFxId(m)); break; // 누군가 스킬을 썼다: 그 연출(4.33)
    // 내가 스킬에 걸렸거나 풀렸다, 스킬을 쓰지 못했다(4.33): 묶음은 selfStatusMessages가 처리한다
    case 'skillFail': case 'dark': case 'darkEnd': case 'slow': case 'slowEnd': case 'stun': case 'stunEnd': case 'pull': case 'pullEnd':
      handleSelfStatus(m, arena, skillLock, showToast); break;
    case 'dash': {
      // 대시 시작(4.27): 예측을 같은 속도로 올리고 아래 표시줄에 남은 시간·쿨타임을 보여 준다
      arena.startDash(m.ms, m.mult);
      const t = performance.now();
      setDash({ until: t + m.ms, readyAt: t + m.cooldownMs });
      break;
    }
  }
}
