import type { Mission } from '../../types/mission';

/** 키 사전 키 이름을 레슨 `optimalKeys` 의 키 토큰으로 바꿉니다. */
function toMissionKeyToken(key: string): string {
  if (key === 'Esc') return 'Escape';
  if (key === 'Space') return ' ';
  return key;
}

/** 제목에서 키처럼 보이는 조각들 (`(h, j, k, l)`, `Ctrl+w`, `:vsp`) */
function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .replace(/Ctrl\+/gi, 'Ctrl-')
      .split(/[\s,()/·&]+/)
      .map((token) => token.trim())
      .filter(Boolean)
  );
}

/**
 * 이 키를 연습할 수 있는 레슨을 고릅니다.
 * 제목에 키가 적힌 레슨을 먼저, 그다음 모범 답안(`optimalKeys`)에 키가 들어간 레슨을 번호순으로 보여 줍니다.
 */
export function lessonsForKey(key: string, missions: readonly Mission[], limit = 4): Mission[] {
  const token = toMissionKeyToken(key);
  const byTitle = missions.filter((m) => titleTokens(m.title).has(key));
  const byKeys = missions.filter((m) => m.optimalKeys?.includes(token));
  const picked: Mission[] = [];
  for (const m of [...byTitle, ...byKeys]) {
    if (!picked.includes(m)) picked.push(m);
    if (picked.length >= limit) break;
  }
  return picked;
}
