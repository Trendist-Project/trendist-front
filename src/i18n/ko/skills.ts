/**
 * 스킬 이름·설명(4.33). 키는 <스킬 코드>_name · <스킬 코드>_desc. 스킬을 늘리면 DB(skills)에 행을 넣고 여기에 이 두 줄을 더한다.
 * 이 파일에 없는 스킬은 이름 자리에 코드가 보인다.
 */
export default {
  dash_name: '대시',
  dash_desc: '움직이는 방향으로 잠깐 빠르게 달려요. 움직이는 중에만 쓸 수 있어요.',
  shockwave_name: '충격파',
  shockwave_desc: '내 원 둘레로 충격파를 퍼뜨려 닿은 원을 밀어내요. 키워드는 잃지 않아요. 세이프존에서는 쓸 수 없어요.',
  hook_name: '갈고리',
  hook_desc: '겨눈 방향으로 갈고리를 던져요. 맞은 원은 키워드 1개를 잃고 나에게 끌려와요. 세이프존에서는 쓸 수 없어요.',
  shield_name: '방패',
  shield_desc: '잠깐 다른 원과 부딪히지 않고 통과해요.',
  stealth_name: '은신',
  stealth_desc: '잠깐 다른 사람 눈에 배경처럼 안 보여요. 공격 스킬을 쓰면 풀려요.',
} as Record<string, string>;
