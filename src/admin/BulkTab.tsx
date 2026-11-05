import { useState, type FormEvent } from 'react';
import { adminApi } from '../api/client';
import { successToast } from '../ui/toast';
import { errMsg, fmt, useHoldText } from './format';

/**
 * 키워드 일괄 처리(13.7): 쉼표·줄바꿈으로 여러 개를 적고, 한 번에 🔥추가하거나 ⛔금지한다.
 * 입력 → 확인 → 실행(진행률) → 결과(성공·실패 요약, 실패한 것만 다시 입력) 순서다. 금지는 등록 전 단어도 바로 된다.
 */
type Mode = 'add' | 'ban';
type Result = { text: string; ok: boolean; message: string };
const MAX = 100; // 한 번에 처리하는 상한(하나씩 차례로 보내므로 너무 길어지지 않게)

export function parseKeywords(input: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,，\n]/)) {
    const t = raw.trim().replace(/\s+/g, ' ');
    const key = t.replace(/\s+/g, '').toLowerCase(); // 서버 정규화처럼 공백·대소문자는 같은 키워드로 본다
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

const COPY: Record<Mode, { title: string; hint: (hold: string) => string; placeholder: string; confirm: (n: number) => string; run: string; running: string; done: string }> = {
  add: {
    title: '🔥 일괄 추가',
    hint: (hold) => `바로 🔥활성이 되고 반영 소스가 admin이에요. 넣은 때부터 ${hold} 동안 유지되고, 끝나면 internal로 내려가요.`,
    placeholder: '예) 양쯔깐루, 두바이 쫀득 쿠키, 말차라떼',
    confirm: (n) => `${n}개를 🔥활성 키워드로 추가할까요?`,
    run: '추가', running: '추가하는 중', done: '추가',
  },
  ban: {
    title: '⛔ 일괄 금지',
    hint: () => '검색·추가가 막히고 공개 페이지도 열리지 않아요. 가진 사람의 점수에서도 바로 빠져요. 아직 등록되지 않은 단어는 금지 상태로 새로 등록돼요. 금지는 키워드 목록에서 하나씩 풀 수 있어요.',
    placeholder: '예) 금지할 단어1, 금지할 단어2',
    confirm: (n) => `${n}개를 금지할까요? 이미 등록된 키워드는 바로 막혀요.`,
    run: '금지', running: '금지하는 중', done: '금지',
  },
};

export function BulkTab() {
  const [mode, setMode] = useState<Mode>('add');
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [ranMode, setRanMode] = useState<Mode>('add');

  const list = parseKeywords(input);
  const tooMany = list.length > MAX;
  const copy = COPY[mode];
  const hold = useHoldText();

  async function apply() {
    if (!pending) return;
    setBusy(true); setProgress(0); setRanMode(mode);
    const out: Result[] = [];
    for (const text of pending) {
      try {
        if (mode === 'add') {
          const r = await adminApi.addKeyword(text);
          out.push({ text, ok: true, message: `${r.created ? '새로 만듦' : '이미 있던 키워드를 admin으로'} · 🔥 ${r.trendValue}점 · ${fmt(r.externalUntil)}까지` });
        } else {
          await adminApi.banKeywordText(text);
          out.push({ text, ok: true, message: '⛔ 금지했어요' });
        }
      } catch (e) {
        out.push({ text, ok: false, message: errMsg(e) });
      }
      setResults([...out]); setProgress(out.length);
    }
    setBusy(false); setPending(null); setInput('');
    const ok = out.filter((r) => r.ok).length;
    successToast(`${mode === 'add' ? '추가' : '금지'} ${ok}개 완료${ok < out.length ? ` · 실패 ${out.length - ok}개` : ''}`);
  }

  const failed = results.filter((r) => !r.ok);
  const okCount = results.length - failed.length;

  return (
    <section className="admin-panel bulk">
      <div className="bulk-modes" role="tablist" aria-label="일괄 처리 종류">
        {(['add', 'ban'] as Mode[]).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`bulk-mode ${m}${mode === m ? ' on' : ''}`} disabled={busy}
                  onClick={() => { setMode(m); setPending(null); }}>{COPY[m].title}</button>
        ))}
      </div>
      <p className="muted small bulk-hint">{copy.hint(hold.long)} 여러 개는 쉼표나 줄바꿈으로 나눠 적어요(한 번에 최대 {MAX}개).</p>

      {!pending ? (
        <form className="bulk-form" onSubmit={(e: FormEvent) => { e.preventDefault(); if (list.length && !tooMany) { setPending(list); setResults([]); } }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={5} placeholder={copy.placeholder} aria-label={`${copy.run}할 키워드`} />
          <div className="bulk-preview" aria-live="polite">
            <span className={`bulk-count${tooMany ? ' over' : ''}`}>{list.length}개 인식{tooMany ? ` · ${MAX}개까지만 한 번에 처리해요` : ''}</span>
            {list.length > 0 && <ul className="admin-chips">{list.slice(0, 40).map((k) => <li key={k}>{k}</li>)}{list.length > 40 && <li className="more">+{list.length - 40}개</li>}</ul>}
          </div>
          <div className="admin-actions">
            <button className={mode === 'ban' ? 'danger' : 'primary'} type="submit" disabled={!list.length || tooMany}>확인</button>
            {input && <button type="button" onClick={() => setInput('')}>비우기</button>}
          </div>
        </form>
      ) : (
        <div className={`bulk-confirm ${mode}`} role="alertdialog" aria-label="확인">
          <p><strong>{copy.confirm(pending.length)}</strong></p>
          <ul className="admin-chips">{pending.map((k) => <li key={k}>{k}</li>)}</ul>
          {busy && (
            <div className="bulk-progress" role="status">
              <progress max={pending.length} value={progress} />
              <span className="small">{copy.running}… {progress} / {pending.length}</span>
            </div>
          )}
          <div className="admin-actions">
            <button className={mode === 'ban' ? 'danger solid' : 'primary'} onClick={apply} disabled={busy}>{busy ? `${copy.running}…` : `${pending.length}개 ${copy.run}`}</button>
            <button onClick={() => setPending(null)} disabled={busy}>다시 고치기</button>
          </div>
        </div>
      )}

      {results.length > 0 && !pending && (
        <div className="bulk-result" aria-live="polite">
          <div className="bulk-summary">
            <strong>{ranMode === 'add' ? '추가' : '금지'} 결과</strong>
            <span className="ok">✔ 성공 {okCount}개</span>
            {failed.length > 0 && <span className="fail">✖ 실패 {failed.length}개</span>}
            {failed.length > 0 && (
              <button onClick={() => { setMode(ranMode); setInput(failed.map((r) => r.text).join(', ')); setResults([]); }}>실패한 것만 다시 입력</button>
            )}
          </div>
          <ul className="admin-results">
            {[...failed, ...results.filter((r) => r.ok)].map((r) => <li key={r.text} className={r.ok ? 'ok' : 'fail'}>{r.ok ? '✔' : '✖'} <strong>{r.text}</strong> · {r.message}</li>)}
          </ul>
        </div>
      )}
      {results.length > 0 && pending && busy && (
        <ul className="admin-results">{results.slice(-5).map((r) => <li key={r.text} className={r.ok ? 'ok' : 'fail'}>{r.ok ? '✔' : '✖'} <strong>{r.text}</strong></li>)}</ul>
      )}
    </section>
  );
}
