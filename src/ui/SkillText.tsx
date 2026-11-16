import { Fragment, type ReactNode } from 'react';
import { SKILL_DEFS } from '../game/skills';
import koSkills from '../i18n/ko/skills';
import enSkills from '../i18n/en/skills';
import { SkillIcon } from './SkillIcon';
import { tOr } from '../i18n';

/**
 * 가이드·공지 글 속 스킬 아이콘(4.33). 글자 이모지 대신 스킬 코드로 적는다:
 *  - `[[아이콘 invincibility]]`(영어 글은 `[[icon invincibility]]`): 실제 스킬 아이콘 + 지금 언어의 스킬 이름(번역 파일 `skills.<코드>_name`)으로 바뀐다.
 *  - 제목이 스킬 이름과 똑같으면(`SkillText title`) 그 앞에 아이콘을 붙인다(제목은 이름만 적는다).
 *  - 예전 글에 남은 "이모지 + 스킬 이름"(🛡 무적, ☠️ poison)도 그대로 아이콘으로 바꿔 그린다(관리자가 고치지 않은 예전 글을 위해).
 * 아래는 이 중 예전 글을 위한 설명이다. 이모지(예: "🛡 무적", "☠️ poison")를 실제 스킬 아이콘(SVG)으로 바꿔 그린다.
 * 이모지만 보고 바꾸면 🔥(활성 키워드)처럼 다른 뜻으로 쓴 것까지 바뀌므로, "이모지 + 그 스킬의 한국어/영어 이름"이 이어질 때만 바꾼다.
 * 글(DB)은 그대로 두고 그릴 때만 바꾸므로, 관리자가 쓴 글에도 똑같이 적용된다.
 */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = (code: string) => [(koSkills as Record<string, string>)[`${code}_name`], (enSkills as Record<string, string>)[`${code}_name`]].filter(Boolean);
const entries = SKILL_DEFS.map((d) => {
  const [ko, en] = names(d.code);
  // 한국어 이름 뒤에는 조사가 바로 붙으므로 경계 검사를 하지 않고, 영어 이름은 단어 끝에서만 맞춘다
  const alt = [ko && esc(ko), en && `${esc(en)}(?![A-Za-z])`].filter(Boolean).join('|');
  return { code: d.code, src: `${esc(d.emoji.replace(/️/g, ''))}\\uFE0F?\\s*(?:${alt})` };
});
const CODES = SKILL_DEFS.map((d) => d.code);
const TOKEN = (cap: boolean) => '\\[\\[(?:아이콘|icon) (' + (cap ? '' : '?:') + CODES.join('|') + ')\\]\\]'; // 쪼갤 때는 묶음이 따로 섞여 나오지 않게 캡처하지 않는다
const RE = new RegExp(`(${TOKEN(false)}|${entries.map((e) => `(?:${e.src})`).join('|')})`, 'gi');
const TOKEN_RE = new RegExp(`^${TOKEN(true)}$`, 'i');
const CODE_OF = entries.map((e) => ({ code: e.code, re: new RegExp(`^(?:${e.src})$`, 'i') }));

/** 글 한 토막을 그린다(스킬 이름 앞 이모지만 아이콘으로) */
export function skillText(s: string): ReactNode[] {
  return s.split(RE).filter(Boolean).map((part, i) => {
    const tok = TOKEN_RE.exec(part);
    if (tok) { const code = tok[1].toLowerCase(); return <Fragment key={i}><span className="skill-inline"><SkillIcon code={code} /></span>{' '}{tOr(`skills.${code}_name`, code)}</Fragment>; }
    const hit = CODE_OF.find((c) => c.re.test(part));
    if (!hit) return <Fragment key={i}>{part}</Fragment>;
    const label = part.replace(/^[^\p{L}\p{N}]+/u, ''); // 이모지와 공백을 뺀 이름
    return <Fragment key={i}><span className="skill-inline"><SkillIcon code={hit.code} /></span>{' '}{label}</Fragment>;
  });
}

/** 제목이 스킬 이름과 똑같은지(한국어·영어 이름, 대소문자 무시): 그 스킬 코드 */
function titleCode(text: string): string | null {
  const t = text.trim().toLowerCase();
  return SKILL_DEFS.find((d) => names(d.code).some((n) => n.toLowerCase() === t))?.code ?? null;
}

/** title이면 제목 규칙(이름만 적힌 제목 앞에 아이콘)도 쓴다 */
export function SkillText({ text, title }: { text: string; title?: boolean }) {
  const code = title ? titleCode(text) : null;
  if (code) return <><span className="skill-inline"><SkillIcon code={code} /></span>{' '}{text}</>;
  return <>{skillText(text)}</>;
}
