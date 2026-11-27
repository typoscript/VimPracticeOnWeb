import { i18nKey } from '../../i18n';

// 자유 연습장 상단 '바로 체험' 칩: 누르면 해당 키 시퀀스를 에디터에 주입합니다.
export const SANDBOX_QUICK_TRY_CHIPS: ReadonlyArray<{
  id: string;
  label: string;
  titleKey: string;
  keys: readonly string[];
}> = [
  {
    id: 'neotree',
    label: '🌲 :Neotree',
    titleKey: i18nKey('파일 트리 사이드바 토글 (:Neotree)'),
    keys: ['Escape', ...':Neotree toggle'.split(''), 'Enter'],
  },
  {
    id: 'oil',
    label: '📁 :Oil',
    titleKey: i18nKey('파일시스템 버퍼 편집 (:Oil)'),
    keys: ['Escape', ...':Oil'.split(''), 'Enter'],
  },
  {
    id: 'trouble',
    label: '🩺 :Trouble',
    titleKey: i18nKey('프로젝트 TODO · 진단 트리 (:Trouble)'),
    keys: ['Escape', ...':Trouble'.split(''), 'Enter'],
  },
  {
    id: 'harpoon',
    label: '⚓ :HarpoonMenu',
    titleKey: i18nKey('핀 파일 빠른 전환 (:HarpoonMenu)'),
    keys: ['Escape', ...':HarpoonMenu'.split(''), 'Enter'],
  },
  {
    id: 'yanky',
    label: '📋 :Yanks',
    titleKey: i18nKey('복사 링 히스토리 (:YankyRingHistory)'),
    // 새 연습장은 복사 이력이 비어 있으므로 현재 줄을 한 번 복사한 뒤 엽니다.
    keys: ['Escape', 'y', 'y', ...':Yanks'.split(''), 'Enter'],
  },
  {
    id: 'spectre',
    label: '🔁 :Spectre v1 v2',
    titleKey: i18nKey('프로젝트 대화형 검색 · 치환 (:Spectre)'),
    keys: ['Escape', ...':Spectre v1 v2'.split(''), 'Enter'],
  },
  {
    id: 'livegrep',
    label: '🔎 :LiveGrep',
    titleKey: i18nKey('프로젝트 전체 검색 (:LiveGrep)'),
    keys: ['Escape', ...':LiveGrep'.split(''), 'Enter'],
  },
  {
    id: 'undotree',
    label: '🌿 :UndotreeToggle',
    titleKey: i18nKey('시각적 Undo 트리 (:UndotreeToggle)'),
    keys: ['Escape', ...':UndotreeToggle'.split(''), 'Enter'],
  },
  {
    id: 'flash',
    label: '⚡ gs',
    titleKey: i18nKey('화면 라벨 점프 (gs)'),
    keys: ['Escape', 'g', 's'],
  },
  {
    id: 'gitsigns',
    label: '🔀 ]h',
    titleKey: i18nKey('Git Hunk 이동 (]h)'),
    keys: ['Escape', ']', 'h'],
  },
  {
    id: 'gitpanel',
    label: '🐙 :Git',
    titleKey: i18nKey('인터랙티브 Git 스테이징 · 커밋 패널 (:Git)'),
    keys: ['Escape', ...':Git'.split(''), 'Enter'],
  },
  {
    id: 'gblame',
    label: '🕵️ :Gblame',
    titleKey: i18nKey('인라인 Git Blame 토글 (:Gblame)'),
    keys: ['Escape', ...':Gblame'.split(''), 'Enter'],
  },
  {
    id: 'snippets',
    label: '✂️ :Snippets',
    titleKey: i18nKey('내장 스니펫 트리거 목록 (:Snippets)'),
    keys: ['Escape', ...':Snippets'.split(''), 'Enter'],
  },
  {
    id: 'multicursor',
    label: '✨ :MultiCursor user',
    titleKey: i18nKey('다중 커서 편집 (g Ctrl-n)'),
    keys: ['Escape', ...':MultiCursor user'.split(''), 'Enter'],
  },
  {
    id: 'minimove',
    label: '↕️ Alt-j/k',
    titleKey: i18nKey('줄 · 블록 즉시 이동 (Alt-j/k/h/l)'),
    keys: ['Escape', 'Alt-j'],
  },
  {
    id: 'terminal',
    label: '💻 :ToggleTerm',
    titleKey: i18nKey('내장 분할 터미널 토글 (:ToggleTerm)'),
    keys: ['Escape', ...':ToggleTerm'.split(''), 'Enter'],
  },
  {
    id: 'treesj',
    label: '🌳 gS',
    titleKey: i18nKey('구조적 Split/Join 토글 (gS / :TSJToggle)'),
    // 자유 연습장 17번 줄의 { ... } 객체로 이동해 나눕니다 (1번 줄 주석에서 실행하면 주석을 나눔).
    keys: ['Escape', '1', '7', 'G', 'f', '{', 'g', 'S'],
  },
  {
    id: 'zenmode',
    label: '🧘 :ZenMode',
    titleKey: i18nKey('몰입형 집중 모드 토글 (:ZenMode)'),
    keys: ['Escape', ...':ZenMode'.split(''), 'Enter'],
  },
  {
    id: 'noice',
    label: '✨ :set noice',
    titleKey: i18nKey('noice.nvim 플로팅 커맨드라인 토글 (:set cmdlinepopup)'),
    keys: ['Escape', ...':set cmdlinepopup!'.split(''), 'Enter', ':'],
  },
  {
    id: 'gitconflict',
    label: '⚔️ :GitConflictListQf',
    titleKey: i18nKey('프로젝트 머지 충돌 퀵픽스 탐색 (:GitConflictListQf)'),
    keys: ['Escape', ...':GitConflictListQf'.split(''), 'Enter'],
  },
  {
    id: 'dap',
    label: '🐞 :DapUiToggle',
    titleKey: i18nKey('nvim-dap 인터랙티브 디버거 패널 (:DapUiToggle)'),
    keys: ['Escape', ...':DapUiToggle'.split(''), 'Enter'],
  },
  {
    id: 'lua',
    label: '🌙 :source init.lua',
    titleKey: i18nKey('Lua 설정 즉시 적용 (:source init.lua)'),
    keys: ['Escape', ...':source init.lua'.split(''), 'Enter'],
  },
];
