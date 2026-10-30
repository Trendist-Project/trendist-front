import { Fragment, type ReactNode } from 'react';
import { GrowthIcons } from './GrowthIcons';
import { ArenaLegend, Controls, KeywordStates, StartSteps } from './GuideArt';

/** 본문에 넣을 수 있는 게임 그림. 이름이 틀리면 글자 그대로 보인다. */
const EMBEDS: Record<string, () => ReactNode> = {
  '[[성장 아이콘]]': () => <GrowthIcons />,
  '[[시작 3단계]]': () => <StartSteps />,
  '[[조작]]': () => <Controls />,
  '[[키워드 상태]]': () => <KeywordStates />,
  '[[아레나 표시]]': () => <ArenaLegend />,
};

/** 관리자 편집기의 [그림] 메뉴가 쓰는 이름들 */
export const EMBED_NAMES = Object.keys(EMBEDS);

/**
 * 공지·가이드 본문을 그린다. 마크다운 중 문단, `## ` 소제목, `- ` 목록, `1. ` 번호 목록, `**굵게**`, `` `키` ``(키 모양), `> ` 팁 상자,
 * http(s) 주소 자동 링크만 지원한다(4.17 허용 문법).
 * HTML로 넣지 않고 React 요소로만 만들어서, 본문에 태그가 섞여 있어도 글자로만 보인다.
 * 한 문단이 정해진 이름의 `[[...]]` 하나뿐이면 그 자리에 게임 그림을 넣는다(EMBEDS).
 */
export function RichText({ text }: { text: string }) {
  return <div className="rich-text"><RichTextBlocks text={text} /></div>;
}

function RichTextBlocks({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((block, i) => {
        const embed = EMBEDS[block];
        if (embed) return <Fragment key={i}>{embed()}</Fragment>;
        const lines = block.split('\n').map((l) => l.trim());
        // 소제목: 문단 첫 줄이 `## `이면 소제목, 나머지 줄은 그 아래 문단
        if (lines[0].startsWith('## ')) {
          const rest = lines.slice(1).join('\n');
          return <Fragment key={i}><h4 className="rt-heading">{inline(lines[0].slice(3))}</h4>{rest && <RichTextBlocks text={rest} />}</Fragment>;
        }
        if (lines.every((l) => /^> ?/.test(l))) {
          return <aside key={i} className="tip"><span aria-hidden="true">💡</span><p>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l.replace(/^> ?/, ''))}</Fragment>)}</p></aside>;
        }
        if (lines.every((l) => /^- /.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ''))}</li>)}</ol>;
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </>
  );
}

// 끝의 문장 부호(.,!? 등)와 닫는 괄호는 주소에 넣지 않는다
const URL_RE = /(https?:\/\/[^\s<>"'`]*[^\s<>"'`.,!?;:)\]])/g;

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{links(part.slice(2, -2))}</strong>
      : part.length > 2 && part.startsWith('`') && part.endsWith('`') ? <kbd key={i}>{part.slice(1, -1)}</kbd>
        : <Fragment key={i}>{links(part)}</Fragment>);
}

/** http(s) 주소만 링크로 만든다(새 탭, 주소 그대로 보인다). javascript: 같은 주소는 글자로 남는다 */
function links(s: string): ReactNode[] {
  return s.split(URL_RE).filter(Boolean).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a>
      : <Fragment key={i}>{part}</Fragment>);
}
