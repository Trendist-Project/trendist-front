/**
 * 스킬 아이콘. 대부분은 DB의 이모지 글자를 그대로 쓰지만, 회복(heal)은 글자 이모지로는 굵은 초록 +를 낼 수 없어서
 * CSS로 그린 굵은 초록 + 모양을 쓴다(글자 크기에 맞춰 1em).
 */
export function SkillIcon({ code, icon }: { code: string; icon: string | null | undefined }) {
  if (code === 'heal') return <i className="heal-plus" aria-hidden="true" />;
  return <>{icon}</>;
}
