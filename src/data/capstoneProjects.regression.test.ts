import { describe, it, expect } from 'vitest';
import { VimEditorState, handleKey } from '../vim-engine';
import { CAPSTONE_PROJECTS, createCapstoneMission } from './capstoneProjects';
import { buildCustomInitialState } from '../utils/missionInitialState';

/** '<CR>', '<Esc>', '<C-a>', '<Tab>' 표기를 엔진 키 이름으로 바꿉니다. */
function parseKeys(text: string): string[] {
  const named: Record<string, string> = { '<CR>': 'Enter', '<Esc>': 'Escape', '<C-a>': 'Ctrl-a', '<Tab>': 'Tab' };
  const keys: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const tag = Object.keys(named).find((t) => text.startsWith(t, i));
    if (tag) {
      keys.push(named[tag]);
      i += tag.length - 1;
    } else {
      keys.push(text[i]);
    }
  }
  return keys;
}

/** 앱의 handlePlayCapstoneProject 와 같은 방식으로 캡스톤을 시작해 키를 입력합니다. */
function play(id: string, keyText: string) {
  const project = CAPSTONE_PROJECTS.find((p) => p.id === id)!;
  const mission = createCapstoneMission(project);
  let state: VimEditorState = buildCustomInitialState(mission, {
    activePresets: {},
    leaderKey: ' ',
    customKeymaps: [],
  });
  const initiallyComplete = mission.checkComplete(state);
  for (const key of parseKeys(keyText)) state = handleKey(state, key);
  return { initiallyComplete, complete: mission.checkComplete(state), state };
}

// 캡스톤 점검 때 힌트·추천 도구대로 실제로 풀어 본 경로입니다.
const SOLUTIONS: Array<[string, string]> = [
  ['capstone-api-v2', 'f1r2j0<C-a>:Spectre /v1/ /v2/<CR>:SpectreApply<CR>:Harpoon 3<CR>dd:TestRun<CR>'],
  [
    'capstone-hotfix',
    '<C-a>2j0f=a=<Esc>:Harpoon 2<CR>2wcrcj$bcw100<Esc>:Harpoon 3<CR>f"ci"healthy<Esc>:w<CR>:terminal<CR>npm test<CR>exit<CR>',
  ],
  ['capstone-pr-review', 'ddgra1:Harpoon 2<CR>gS:Harpoon 3<CR>2wcruj<C-a>:TestRun<CR>'],
  ['capstone-git-release', ']hjdd<C-a>:Harpoon 2<CR><C-a>:Harpoon 1<CR>:Git commit -m "chore: release 2.4.0"<CR>:TestRun<CR>'],
  [
    'capstone-ts-modernize',
    '2wcrcj02wcruoiface<Tab>OrderSummary<Esc>:Harpoon 2<CR>gS3j0<C-a>:Spectre /legacy/ /modern/<CR>:SpectreApply<CR>:Harpoon 3<CR>dd:TestRun<CR>',
  ],
  [
    'capstone-merge-debug',
    ']xct]xcb:Harpoon 2<CR>2j:DapBp<CR>:DapContinue<CR>:DapStepOver<CR>:DapTerminate<CR>kf+r-:TestRun<CR>',
  ],
];

describe('실무 캡스톤', () => {
  it('6개 캡스톤 모두에 풀이 경로가 있다', () => {
    expect(SOLUTIONS.map(([id]) => id).sort()).toEqual(CAPSTONE_PROJECTS.map((p) => p.id).sort());
  });

  it.each(SOLUTIONS)('%s 는 시작 시 미완료이고 안내된 도구로 클리어된다', (id, keyText) => {
    const result = play(id, keyText);
    expect(result.initiallyComplete).toBe(false);
    expect(result.complete).toBe(true);
  });

  it(':ToggleTerm 분할 터미널에서 npm test 를 돌려도 코드 창 내용을 읽는다', () => {
    const result = play(
      'capstone-hotfix',
      '<C-a>2j0f=a=<Esc>:Harpoon 2<CR>2wcrcj$bcw100<Esc>:Harpoon 3<CR>f"ci"healthy<Esc>:w<CR>:ToggleTerm<CR>npm test<CR>'
    );
    expect(result.state.lastTestRun?.allPassed).toBe(true);
    expect(result.complete).toBe(true);
  });

  it(':ToggleTerm 을 닫으면 원래 파일 창으로 돌아온다', () => {
    const result = play('capstone-hotfix', ':Harpoon 3<CR>:ToggleTerm<CR>exit<CR>');
    expect(result.state.primaryFilename).toBe('src/health.ts');
    expect(result.state.lines.join('\n')).not.toContain('[Neovim Terminal]');
  });

  it('충돌 마커만 지우고 양쪽을 모두 남기면 머지 캡스톤이 통과하지 않는다', () => {
    const result = play(
      'capstone-merge-debug',
      ':g/^[<=>]\\{7}/d<CR>:Harpoon 2<CR>2j:DapBp<CR>:DapContinue<CR>:DapStepOver<CR>:DapTerminate<CR>kf+r-:TestRun<CR>'
    );
    expect(result.complete).toBe(false);
  });
});
