import { Fragment, type ReactNode } from 'react';
import { GrowthIcons } from './GrowthIcons';

/** 본문에 넣을 수 있는 게임 그림. 이름이 틀리면 글자 그대로 보인다. */
const EMBEDS: Record<string, () => ReactNode> = { '[[성장 아이콘]]': () => <GrowthIcons /> };

/**
 * 공지·가이드 본문을 그린다. 마크다운 중 문단, `- ` 목록, `1. ` 번호 목록, `**굵게**`만 지원한다(4.17 허용 문법).
 * HTML로 넣지 않고 React 요소로만 만들어서, 본문에 태그가 섞여 있어도 글자로만 보인다.
 * 한 문단이 정해진 이름의 `[[...]]` 하나뿐이면 그 자리에 게임 그림을 넣는다(지금은 `[[성장 아이콘]]`: 레벨별 거북이).
 */
export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="rich-text">
      {blocks.map((block, i) => {
        const embed = EMBEDS[block];
        if (embed) return <Fragment key={i}>{embed()}</Fragment>;
        const lines = block.split('\n').map((l) => l.trim());
        if (lines.every((l) => /^- /.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ''))}</li>)}</ol>;
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
}
