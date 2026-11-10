import { useMemo, useState } from 'react';
import { adminApi, type AdminMonsterSetting, type AdminMonsterType } from '../../api/client';
import { successToast } from '../../ui/toast';
import { errMsg } from '../format';
import { fmtVal } from './meta';

/** 한 몬스터의 설정 편집 상태: 개요·패턴·설정 탭이 같은 초안을 나눠 쓰고, 바꾼 칸만 한꺼번에 저장한다 */
export function useSettingsEditor(type: AdminMonsterType, onError: (m: string) => void) {
  const [items, setItems] = useState<AdminMonsterSetting[]>(type.settings);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const valueOf = (s: AdminMonsterSetting) => draft[s.name] ?? fmtVal(s.value);
  const check = (s: AdminMonsterSetting): string | null => {
    const raw = valueOf(s).trim();
    const n = Number(raw);
    if (raw === '' || Number.isNaN(n)) return '숫자를 입력해 주세요';
    if (n < s.min || n > s.max) return `${fmtVal(s.min)} ~ ${fmtVal(s.max)} 사이로 정해 주세요`;
    return null;
  };
  const isChanged = (s: AdminMonsterSetting) => draft[s.name] !== undefined && Number(draft[s.name]) !== s.value;
  const dirty = useMemo(() => items.filter(isChanged), [items, draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocked = dirty.filter((s) => check(s));

  const set = (name: string, v: string) => setDraft((d) => ({ ...d, [name]: v }));
  const reset = () => setDraft({});
  const saveAll = async () => {
    if (busy || blocked.length > 0 || dirty.length === 0) return;
    setBusy(true);
    let ok = 0;
    for (const s of dirty) {
      try {
        const u = await adminApi.setMonsterSetting(type.code, s.name, Number(draft[s.name]));
        setItems((l) => l.map((x) => (x.name === s.name ? u : x)));
        setDraft((d) => { const n = { ...d }; delete n[s.name]; return n; });
        ok++;
      } catch (e) { onError(`${s.name}: ${errMsg(e)}`); }
    }
    setBusy(false);
    if (ok > 0) successToast(`${ok}개를 저장했어요(1초 안에 반영)`);
  };
  /** 초안을 거치지 않고 바로 저장한다(켜짐/꺼짐 스위치처럼 누르면 곧바로 반영되는 값). 여러 개면 차례로 저장하고 성공한 개수를 돌려준다 */
  const saveNow = async (changes: { name: string; value: number }[]): Promise<number> => {
    if (busy) return 0;
    setBusy(true);
    let ok = 0;
    for (const c of changes) {
      try {
        const u = await adminApi.setMonsterSetting(type.code, c.name, c.value);
        setItems((l) => l.map((x) => (x.name === c.name ? u : x)));
        setDraft((d) => { const n = { ...d }; delete n[c.name]; return n; });
        ok++;
      } catch (e) { onError(`${c.name}: ${errMsg(e)}`); }
    }
    setBusy(false);
    return ok;
  };
  return { items, draft, busy, valueOf, check, isChanged, dirty, blocked, set, reset, saveAll, saveNow };
}
export type SettingsEditor = ReturnType<typeof useSettingsEditor>;
