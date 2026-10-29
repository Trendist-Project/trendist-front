import { forwardRef, useEffect, useRef, useState, type FormEvent } from 'react';
import { ReportDialog } from './ReportDialog';

/** 화면에 쌓는 채팅 한 줄. id는 서버의 채팅 메시지 번호(신고에 쓴다). */
export interface ChatLine { id: number; e: number; nickname: string; text: string; at: number; mine: boolean }

interface Props {
  lines: ChatLine[];
  disabled: boolean;
  onSend(text: string): void;
  onKeyword(text: string): void;
  onNotice(message: string): void;
  /** 접으면 마지막 한 줄과 입력창만 남긴다. */
  collapsed: boolean;
  onToggleCollapsed(): void;
}

const MAX = 100;
const TAG = /(#[^\s#]{1,20})/g;

/**
 * 나라 방 전체 채팅(4.13). 메시지 100자, 1초에 1회(서버가 검사).
 * `#키워드`를 누르면 검색창에 넣고 검색한다. Enter로 입력창에 들어가고, Esc로 나와서 다시 조작한다.
 * 남의 메시지에 마우스를 올리면(모바일은 누르면) [신고]가 보인다. 접으면 마지막 한 줄과 입력창만 남는다.
 */
export const ChatPanel = forwardRef<HTMLInputElement, Props>(function ChatPanel({ lines, disabled, onSend, onKeyword, onNotice, collapsed, onToggleCollapsed }, inputRef) {
  const [text, setText] = useState('');
  const [reporting, setReporting] = useState<ChatLine | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const shown = collapsed ? lines.slice(-1) : lines;

  // 새 메시지가 오면 맨 아래로. 위로 올려 읽는 중이면 그대로 둔다
  useEffect(() => {
    const el = logRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [lines.length, collapsed]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) { (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur(); return; }
    onSend(t);
    setText('');
  }

  return (
    <section className={collapsed ? 'chat collapsed' : 'chat'} aria-label="채팅">
      <ol className="chat-log" ref={logRef} aria-live="polite">
        {shown.length === 0 && <li className="muted small">{collapsed ? '아직 채팅이 없어요' : '첫 메시지를 남겨 보세요. #키워드 를 쓰면 누르는 사람이 바로 검색해요'}</li>}
        {shown.map((l) => (
          <li key={l.id} className={l.mine ? 'mine' : undefined} tabIndex={l.mine ? undefined : -1}>
            <strong>{l.nickname}</strong>{': '}
            {l.text.split(TAG).map((part, i) => (/^#[^\s#]{1,20}$/.test(part)
              ? <button key={i} className="chat-tag" onClick={() => onKeyword(part.slice(1))} title={`${part.slice(1)} 검색`}>{part}</button>
              : <span key={i}>{part}</span>))}
            {!l.mine && (
              <button className="chat-report" onClick={() => setReporting(l)} aria-label={`${l.nickname}의 메시지 신고`}>신고</button>
            )}
          </li>
        ))}
      </ol>
      <form className="chat-input" onSubmit={submit}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX} disabled={disabled}
               placeholder={disabled ? '연결 중…' : 'Enter로 채팅 (#키워드 가능)'} aria-label="채팅 입력" autoComplete="off"
               onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }} />
        {/* 접기 버튼은 입력 줄 오른쪽 끝에 둔다. 메시지 목록 위에 겹치면 스크롤 막대를 가린다 */}
        <button type="button" className="chat-fold" onClick={onToggleCollapsed} aria-expanded={!collapsed}
                title={collapsed ? '채팅 펼치기' : '채팅 접기'} aria-label={collapsed ? '채팅 펼치기' : '채팅 접기'}>
          {collapsed ? '▴' : '▾'}
        </button>
      </form>
      {reporting && (
        <ReportDialog target="CHAT" targetId={reporting.id} preview={`${reporting.nickname}: ${reporting.text}`}
                      onClose={() => setReporting(null)} onDone={(msg) => { setReporting(null); onNotice(msg); }} />
      )}
    </section>
  );
});
