import { useRef, useState, type KeyboardEvent } from 'react';
import { EMBED_NAMES } from '../ui/RichText';

interface Props {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  rows?: number;
  /** 가이드처럼 게임 그림(`[[이름]]`)을 넣을 수 있으면 [그림] 메뉴를 보인다 */
  embeds?: boolean;
  id?: string;
}

type LineKind = 'heading' | 'bullet' | 'number' | 'tip';
const PREFIX: Record<LineKind, RegExp> = { heading: /^## /, bullet: /^- /, number: /^\d+\. /, tip: /^> ?/ };

/**
 * 공지·가이드 본문 편집기(13.4). 서식 단추가 본문 문법(RichText)을 대신 써 준다. 저장은 지금처럼 글자(문법)라서
 * HTML을 넣지 않고, 화면은 늘 RichText로만 그린다(태그가 섞여도 글자로 보인다). 옆의 미리 보기로 결과를 바로 본다.
 * 단추로 바꾼 것도 브라우저의 되돌리기(Ctrl+Z)로 되돌릴 수 있게 execCommand('insertText')로 넣는다.
 */
export function MarkupEditor({ value, onChange, placeholder, rows = 14, embeds = false, id }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [help, setHelp] = useState(false);

  /** [start, end) 를 text로 바꾸고, 바꾼 뒤 [selStart, selEnd)를 고른다(text 안의 위치) */
  function replace(start: number, end: number, text: string, selStart = text.length, selEnd = selStart) {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(start, end);
    // 되돌리기 기록에 남도록 브라우저 입력으로 넣는다. 안 되는 브라우저는 값을 직접 바꾼다
    const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
    if (!ok) onChange(ta.value.slice(0, start) + text + ta.value.slice(end));
    requestAnimationFrame(() => ta.setSelectionRange(start + selStart, start + selEnd));
  }

  /** 고른 글을 앞뒤 기호로 감싼다. 고른 글이 없으면 예시 글을 넣고 그 부분을 고른다 */
  function wrap(mark: string, sample: string) {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const picked = ta.value.slice(s, e);
    const inner = picked || sample;
    // 이미 감싸져 있으면 벗긴다
    if (picked && ta.value.slice(s - mark.length, s) === mark && ta.value.slice(e, e + mark.length) === mark) {
      replace(s - mark.length, e + mark.length, picked, 0, picked.length);
      return;
    }
    replace(s, e, mark + inner + mark, mark.length, mark.length + inner.length);
  }

  /** 고른 줄(커서가 있는 줄) 앞에 기호를 붙이거나, 모두 붙어 있으면 뗀다 */
  function lines(kind: LineKind) {
    const ta = ref.current;
    if (!ta) return;
    const v = ta.value;
    const start = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    const endIdx = v.indexOf('\n', ta.selectionEnd);
    const end = endIdx < 0 ? v.length : endIdx;
    const ls = v.slice(start, end).split('\n');
    const all = ls.every((l) => PREFIX[kind].test(l));
    const out = ls.map((l, i) => {
      const bare = l.replace(/^(## |- |\d+\. |> ?)/, '');
      if (all) return bare;
      return kind === 'heading' ? `## ${bare}` : kind === 'bullet' ? `- ${bare}` : kind === 'number' ? `${i + 1}. ${bare}` : `> ${bare}`;
    }).join('\n');
    replace(start, end, out, 0, out.length);
  }

  /** 문단으로 따로 들어가야 하는 것(그림)은 앞뒤에 빈 줄을 둔다 */
  function block(text: string) {
    const ta = ref.current;
    if (!ta) return;
    const v = ta.value, s = ta.selectionStart;
    const before = v.slice(0, s), after = v.slice(ta.selectionEnd);
    const pre = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const post = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    replace(s, ta.selectionEnd, pre + text + post);
  }

  function link() {
    const url = window.prompt('링크 주소(https://로 시작)', 'https://');
    if (!url || !/^https?:\/\/\S+$/.test(url.trim())) return;
    const ta = ref.current!;
    replace(ta.selectionStart, ta.selectionEnd, ` ${url.trim()} `);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); wrap('**', '굵은 글씨'); }
    if (k === 'k') { e.preventDefault(); link(); }
  }

  const tools: [string, string, () => void, string?][] = [
    ['B', '굵게 (Ctrl+B)', () => wrap('**', '굵은 글씨'), 'tool-bold'],
    ['H', '소제목', () => lines('heading'), 'tool-heading'],
    ['•', '목록', () => lines('bullet')],
    ['1.', '번호 목록', () => lines('number')],
    ['💡', '팁 상자', () => lines('tip')],
    ['⌨', '키 모양(예: M)', () => wrap('`', 'M')],
    ['🔗', '링크 (Ctrl+K)', link],
  ];

  return (
    <div className="markup-editor">
      <div className="markup-toolbar" role="toolbar" aria-label="서식">
        {tools.map(([label, title, act, cls]) => (
          <button key={title} type="button" className={cls} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={act}>{label}</button>
        ))}
        {embeds && (
          <select className="markup-embed" value="" aria-label="게임 그림 넣기" onChange={(e) => { if (e.target.value) block(e.target.value); }}>
            <option value="">🖼 그림 넣기</option>
            {EMBED_NAMES.map((n) => <option key={n} value={n}>{n.slice(2, -2)}</option>)}
          </select>
        )}
        <span className="markup-spacer" />
        <button type="button" className={help ? 'on' : undefined} onClick={() => setHelp((v) => !v)} aria-expanded={help} title="문법 도움말">?</button>
      </div>
      {help && (
        <div className="markup-help">
          <span><code>빈 줄</code> 문단 나누기</span><span><code>## 제목</code> 소제목</span><span><code>- 항목</code> 목록</span>
          <span><code>1. 항목</code> 번호 목록</span><span><code>**글**</code> 굵게</span><span><code>&gt; 글</code> 💡 팁 상자</span>
          <span><code>`M`</code> 키 모양</span><span><code>https://…</code> 자동 링크</span>
          {embeds && <span><code>[[이름]]</code> 게임 그림(한 문단에 하나만)</span>}
        </div>
      )}
      <textarea ref={ref} id={id} value={value} rows={rows} placeholder={placeholder} spellCheck={false}
                onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />
    </div>
  );
}
