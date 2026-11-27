import { handleKey } from '../../vim-engine';
import type { VimEditorState } from '../../vim-engine';
import type { Mission } from '../../types/mission';
import { buildMissionInitialState } from '../../utils/missionInitialState';
import { keyReferenceModeFor, type KeyReferenceMode } from './keyReferenceCatalog';

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

/** 명령줄·검색 입력처럼 키 사전 탭에 속하지 않는 모드 */
const NON_TAB_MODES = new Set(['COMMAND', 'SEARCH']);

const usageCache = new Map<number, Set<string>>();

/**
 * 레슨 모범 답안(`optimalKeys`)을 엔진으로 실행해 보며, 각 키를 어느 모드 탭에서 눌렀는지 모읍니다.
 * 결과는 `${탭}:${키}` 집합이며 레슨마다 한 번만 계산합니다. (`:sort f` 의 f 처럼 명령줄에서 친 글자는 빼고,
 * 입력 모드의 Ctrl-u 와 노멀 모드의 Ctrl-u 를 구분합니다.)
 */
function keyUsage(mission: Mission): Set<string> {
  const cached = usageCache.get(mission.id);
  if (cached) return cached;
  const usage = new Set<string>();
  try {
    let state: VimEditorState = buildMissionInitialState(mission, { activePresets: {}, leaderKey: ' ', customKeymaps: [] });
    for (const key of mission.optimalKeys ?? []) {
      if (!NON_TAB_MODES.has(state.mode)) usage.add(`${keyReferenceModeFor(state.mode)}:${key}`);
      state = handleKey(state, key);
    }
  } catch {
    // 실행할 수 없는 레슨은 연결하지 않습니다.
  }
  usageCache.set(mission.id, usage);
  return usage;
}

/**
 * 이 키를 고른 모드에서 연습할 수 있는 레슨을 고릅니다.
 * 모범 답안에서 그 모드로 키를 누르는 레슨만 대상으로, 제목에 키가 적힌 레슨을 먼저, 그다음 번호순으로 보여 줍니다.
 */
export function lessonsForKey(
  key: string,
  missions: readonly Mission[],
  mode: KeyReferenceMode = 'normal',
  limit = 4
): Mission[] {
  const token = toMissionKeyToken(key);
  // 노멀 탭의 Esc 는 "노멀 모드로 돌아가기" 이므로 입력·비주얼 모드에서 누른 Esc 도 연습으로 칩니다.
  const modesToMatch: KeyReferenceMode[] = mode === 'normal' && token === 'Escape' ? ['normal', 'insert', 'visual'] : [mode];
  const usesKey = (m: Mission) =>
    Boolean(m.optimalKeys?.includes(token)) && modesToMatch.some((md) => keyUsage(m).has(`${md}:${token}`));
  const picked: Mission[] = [];
  const add = (m: Mission) => {
    if (picked.length < limit && !picked.includes(m) && usesKey(m)) picked.push(m);
  };
  missions.filter((m) => titleTokens(m.title).has(key)).forEach(add);
  for (const m of missions) {
    if (picked.length >= limit) break;
    add(m);
  }
  return picked;
}
