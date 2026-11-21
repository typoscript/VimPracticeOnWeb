import { VimEditorState } from '../../vim-engine';

export interface WhichKeyItem {
  key: string;
  labelKo: string;
  labelEn: string;
  group?: boolean;
  custom?: boolean;
}

export interface WhichKeyPanelData {
  prefix: string;
  titleKo: string;
  titleEn: string;
  items: WhichKeyItem[];
}

const G_PREFIX_ITEMS: WhichKeyItem[] = [
  { key: 'g', labelKo: '파일 맨 위', labelEn: 'Top of file' },
  { key: 's', labelKo: 'Flash 화면 라벨 점프', labelEn: 'Flash label jump' },
  { key: 'Ctrl-n', labelKo: '다중 커서 선택 (Multi-Cursor)', labelEn: 'Multi-cursor select' },
  { key: 'd', labelKo: '정의로 이동 (LSP)', labelEn: 'Go to definition' },
  { key: 'r', labelKo: '+LSP / 가상 치환', labelEn: '+LSP / Virtual replace', group: true },
  { key: 'O', labelKo: '문서 심볼 (LSP)', labelEn: 'Document symbols' },
  { key: 'c', labelKo: '+주석 토글 (gcc/gc)', labelEn: '+Comment (gcc/gc)', group: true },
  { key: 'q', labelKo: '+줄바꿈 포매팅', labelEn: '+Format text', group: true },
  { key: 'R', labelKo: '가상 치환 모드', labelEn: 'Virtual Replace mode' },
  { key: 'u', labelKo: '소문자 변환', labelEn: 'Lowercase' },
  { key: 'U', labelKo: '대문자 변환', labelEn: 'Uppercase' },
  { key: '~', labelKo: '대소문자 토글', labelEn: 'Toggle case' },
  { key: 'v', labelKo: '직전 비주얼 재선택', labelEn: 'Reselect visual' },
  { key: 'i', labelKo: '직전 삽입 위치', labelEn: 'Last insert pos' },
  { key: ';', labelKo: '이전 변경 위치', labelEn: 'Older change pos' },
  { key: ',', labelKo: '다음 변경 위치', labelEn: 'Newer change pos' },
  { key: 't', labelKo: '다음 탭', labelEn: 'Next tab' },
  { key: 'T', labelKo: '이전 탭', labelEn: 'Previous tab' },
  { key: '-', labelKo: '이전 Undo 트리', labelEn: 'Earlier undo state' },
  { key: '+', labelKo: '다음 Undo 트리', labelEn: 'Later undo state' },
  { key: 'a', labelKo: '문자 코드 정보', labelEn: 'ASCII/Unicode info' },
  { key: 'f', labelKo: '커서 파일 열기', labelEn: 'Open file under cursor' },
];

const GR_PREFIX_ITEMS: WhichKeyItem[] = [
  { key: 'n', labelKo: 'LSP 이름 변경 (Rename)', labelEn: 'LSP Rename symbol' },
  { key: 'r', labelKo: 'LSP 참조 검색 (Refs)', labelEn: 'LSP Find references' },
  { key: 'a', labelKo: 'LSP 코드 액션 (Actions)', labelEn: 'LSP Code actions' },
  { key: '{c}', labelKo: '가상 1글자 치환', labelEn: 'Virtual replace char' },
];

const Z_PREFIX_ITEMS: WhichKeyItem[] = [
  { key: 'a', labelKo: '폴드 토글', labelEn: 'Toggle fold' },
  { key: 'o', labelKo: '폴드 열기', labelEn: 'Open fold' },
  { key: 'c', labelKo: '폴드 닫기', labelEn: 'Close fold' },
  { key: 'R', labelKo: '모든 폴드 열기', labelEn: 'Open all folds' },
  { key: 'M', labelKo: '모든 폴드 닫기', labelEn: 'Close all folds' },
  { key: 'f', labelKo: '수동 폴드 생성', labelEn: 'Create fold' },
  { key: 'd', labelKo: '커서 폴드 삭제', labelEn: 'Delete fold' },
  { key: 'i', labelKo: '폴딩 활성 토글', labelEn: 'Toggle foldenable' },
  { key: 'm', labelKo: '폴드 레벨 감소', labelEn: 'Fold more' },
  { key: 'r', labelKo: '폴드 레벨 증가', labelEn: 'Reduce folding' },
  { key: 'z', labelKo: '커서 화면 중앙', labelEn: 'Center cursor line' },
  { key: 't', labelKo: '커서 화면 상단', labelEn: 'Top cursor line' },
  { key: 'b', labelKo: '커서 화면 하단', labelEn: 'Bottom cursor line' },
  { key: '=', labelKo: '맞춤법 추천', labelEn: 'Spell suggestions' },
  { key: 'g', labelKo: '정상 단어 등록', labelEn: 'Add good word' },
  { key: 'w', labelKo: '오탈자 등록', labelEn: 'Mark wrong word' },
];

const RIGHT_BRACKET_ITEMS: WhichKeyItem[] = [
  { key: 'f', labelKo: '다음 함수 시작', labelEn: 'Next function start' },
  { key: 'F', labelKo: '다음 함수 끝', labelEn: 'Next function end' },
  { key: 'h', labelKo: '다음 Git Hunk', labelEn: 'Next Git hunk' },
  { key: 'd', labelKo: '다음 LSP 진단', labelEn: 'Next diagnostic' },
  { key: 'D', labelKo: '마지막 LSP 진단', labelEn: 'Last diagnostic' },
  { key: 'c', labelKo: '다음 Diff Hunk', labelEn: 'Next diff hunk' },
  { key: 'q', labelKo: '다음 퀵픽스', labelEn: 'Next quickfix' },
  { key: 'l', labelKo: '다음 로케이션', labelEn: 'Next location' },
  { key: 'b', labelKo: '다음 버퍼', labelEn: 'Next buffer' },
  { key: 's', labelKo: '다음 오탈자', labelEn: 'Next spell error' },
  { key: ')', labelKo: '짝 없는 )', labelEn: 'Unmatched )' },
  { key: '}', labelKo: '짝 없는 }', labelEn: 'Unmatched }' },
  { key: 'Space', labelKo: '아래 빈 줄 삽입', labelEn: 'Blank line below' },
];

const LEFT_BRACKET_ITEMS: WhichKeyItem[] = [
  { key: 'f', labelKo: '이전 함수 시작', labelEn: 'Prev function start' },
  { key: 'F', labelKo: '이전 함수 끝', labelEn: 'Prev function end' },
  { key: 'h', labelKo: '이전 Git Hunk', labelEn: 'Prev Git hunk' },
  { key: 'd', labelKo: '이전 LSP 진단', labelEn: 'Prev diagnostic' },
  { key: 'D', labelKo: '첫 LSP 진단', labelEn: 'First diagnostic' },
  { key: 'c', labelKo: '이전 Diff Hunk', labelEn: 'Prev diff hunk' },
  { key: 'q', labelKo: '이전 퀵픽스', labelEn: 'Prev quickfix' },
  { key: 'l', labelKo: '이전 로케이션', labelEn: 'Prev location' },
  { key: 'b', labelKo: '이전 버퍼', labelEn: 'Prev buffer' },
  { key: 's', labelKo: '이전 오탈자', labelEn: 'Prev spell error' },
  { key: '(', labelKo: '짝 없는 (', labelEn: 'Unmatched (' },
  { key: '{', labelKo: '짝 없는 {', labelEn: 'Unmatched {' },
  { key: 'Space', labelKo: '위 빈 줄 삽입', labelEn: 'Blank line above' },
];

const CTRL_W_ITEMS: WhichKeyItem[] = [
  { key: 'h', labelKo: '왼쪽 창', labelEn: 'Focus left pane' },
  { key: 'j', labelKo: '아래 창', labelEn: 'Focus lower pane' },
  { key: 'k', labelKo: '위 창', labelEn: 'Focus upper pane' },
  { key: 'l', labelKo: '오른쪽 창', labelEn: 'Focus right pane' },
  { key: 'v', labelKo: '세로 분할', labelEn: 'Vertical split' },
  { key: 's', labelKo: '가로 분할', labelEn: 'Horizontal split' },
  { key: 'q', labelKo: '현재 창 닫기', labelEn: 'Close window' },
  { key: 'o', labelKo: '다른 창 모두 닫기', labelEn: 'Only this window' },
  { key: 'w', labelKo: '다음 창 순환', labelEn: 'Cycle window' },
  { key: '=', labelKo: '창 크기 균등화', labelEn: 'Equalize splits' },
  { key: 'T', labelKo: '새 탭으로 이동', labelEn: 'Move to new tab' },
  { key: 'g', labelKo: '+분할/새탭 이동 (gf/])', labelEn: '+Split/tab goto', group: true },
];

const TEXT_OBJECT_ITEMS: WhichKeyItem[] = [
  { key: 'w', labelKo: '단어 (word)', labelEn: 'word' },
  { key: 'W', labelKo: '큰 단어 (WORD)', labelEn: 'WORD' },
  { key: '"', labelKo: '큰따옴표 "..."', labelEn: 'Double quotes' },
  { key: "'", labelKo: "작은따옴표 '...'", labelEn: 'Single quotes' },
  { key: '`', labelKo: '백틱 `...`', labelEn: 'Backticks' },
  { key: '(', labelKo: '소괄호 (...)', labelEn: 'Parentheses' },
  { key: '{', labelKo: '중괄호 {...}', labelEn: 'Curly braces' },
  { key: '[', labelKo: '대괄호 [...]', labelEn: 'Square brackets' },
  { key: '<', labelKo: '꺾쇠 <...>', labelEn: 'Angle brackets' },
  { key: 't', labelKo: 'HTML/XML 태그', labelEn: 'HTML/XML tag' },
  { key: 'p', labelKo: '문단 (paragraph)', labelEn: 'Paragraph' },
  { key: 's', labelKo: '문장 (sentence)', labelEn: 'Sentence' },
  { key: 'f', labelKo: '함수 (Treesitter)', labelEn: 'Function (Treesitter)' },
  { key: 'c', labelKo: '클래스 (Treesitter)', labelEn: 'Class (Treesitter)' },
  { key: 'a', labelKo: '인자 (Treesitter)', labelEn: 'Argument (Treesitter)' },
  { key: 'i', labelKo: '들여쓰기 블록', labelEn: 'Indent block' },
  { key: 'n', labelKo: '+다음 객체 (mini.ai next)', labelEn: '+Next object (mini.ai)', group: true },
  { key: 'l', labelKo: '+이전 객체 (mini.ai last)', labelEn: '+Last object (mini.ai)', group: true },
];

const INSERT_CTRL_X_ITEMS: WhichKeyItem[] = [
  { key: 'Ctrl-n', labelKo: '키워드 완성 (다음)', labelEn: 'Keyword completion' },
  { key: 'Ctrl-f', labelKo: '파일 경로 완성', labelEn: 'Filename completion' },
  { key: 'Ctrl-l', labelKo: '전체 줄 완성', labelEn: 'Whole line completion' },
  { key: 'Ctrl-k', labelKo: '사전 단어 완성', labelEn: 'Dictionary completion' },
  { key: 'Ctrl-]', labelKo: '태그 심볼 완성', labelEn: 'Tag completion' },
  { key: 'Ctrl-o', labelKo: 'LSP 옴니 완성', labelEn: 'Omni / LSP completion' },
  { key: 'Ctrl-v', labelKo: 'Vim 명령·함수 완성', labelEn: 'Vim cmd/fn completion' },
  { key: 's', labelKo: '맞춤법 추천 완성', labelEn: 'Spell suggestions' },
];

const INSERT_CTRL_R_ITEMS: WhichKeyItem[] = [
  { key: '"', labelKo: '무명 레지스터', labelEn: 'Unnamed register' },
  { key: '0', labelKo: '최근 복사 (yank)', labelEn: 'Last yank register' },
  { key: '=', labelKo: 'Vimscript 계산식', labelEn: 'Expression register' },
  { key: '%', labelKo: '현재 파일명', labelEn: 'Current filename' },
  { key: '.', labelKo: '직전 삽입 텍스트', labelEn: 'Last inserted text' },
  { key: 'Ctrl-o', labelKo: '리터럴 삽입', labelEn: 'Insert literally' },
  { key: 'Ctrl-p', labelKo: '들여쓰기 맞춤 삽입', labelEn: 'Insert & fix indent' },
  { key: 'a-z', labelKo: '명명된 레지스터', labelEn: 'Named register' },
];

const REGISTER_ITEMS: WhichKeyItem[] = [
  { key: '"', labelKo: '무명 레지스터', labelEn: 'Unnamed register' },
  { key: '0', labelKo: '최근 복사 (0)', labelEn: 'Yank register' },
  { key: '_', labelKo: '블랙홀 (삭제 버림)', labelEn: 'Black hole register' },
  { key: '+', labelKo: '시스템 클립보드', labelEn: 'System clipboard' },
  { key: '=', labelKo: '표현식 계산기', labelEn: 'Expression register' },
  { key: 'a-z', labelKo: '명명된 레지스터', labelEn: 'Named register' },
  { key: 'A-Z', labelKo: '레지스터 이어붙이기', labelEn: 'Append register' },
];

function collectCustomKeymapItems(
  state: VimEditorState,
  modeChar: 'n' | 'v' | 'x' | 's' | 'i',
  rawPrefix: string
): WhichKeyItem[] {
  const leaderKey = state.leaderKey || ' ';
  const expandedPrefix = rawPrefix.replace(/<leader>/gi, leaderKey);
  const bufId = state.currentBufferId ?? 1;
  const sources = [state.bufferKeymaps?.[bufId], state.userKeymaps];
  const seen = new Set<string>();
  const out: WhichKeyItem[] = [];

  for (const map of sources) {
    if (!map) continue;
    for (const [rawKey, rhs] of Object.entries(map)) {
      let keyMode = 'all';
      let lhs = rawKey;
      if (/^[nivxsoc]:/.test(rawKey)) {
        keyMode = rawKey[0];
        lhs = rawKey.slice(2);
      }
      if (keyMode !== 'all' && keyMode !== modeChar) {
        if (!((modeChar === 'v' && keyMode === 'x') || (modeChar === 's' && keyMode === 'v'))) {
          continue;
        }
      }
      const expanded = lhs.replace(/<leader>/gi, leaderKey);
      if (expanded.length <= expandedPrefix.length || !expanded.startsWith(expandedPrefix)) continue;
      const nextSlice = expanded.slice(expandedPrefix.length);
      const nextKey = nextSlice.startsWith('<') && nextSlice.includes('>')
        ? nextSlice.slice(0, nextSlice.indexOf('>') + 1)
        : nextSlice[0];
      if (!nextKey || seen.has(nextKey)) continue;
      seen.add(nextKey);
      const shortRhs = rhs.length > 26 ? `${rhs.slice(0, 25)}…` : rhs;
      out.push({
        key: nextKey,
        labelKo: `★ ${shortRhs}`,
        labelEn: `★ ${shortRhs}`,
        custom: true,
      });
    }
  }
  return out;
}

/**
 * 현재 에디터 상태의 대기 접두 키(pendingKeys / pendingKeymapPrefix / insertCtrlXMode / insertRegisterPending)를
 * 분석하여 which-key.nvim 스타일의 후속 키 안내 목록을 반환합니다.
 */
export function resolveWhichKeyData(state: VimEditorState): WhichKeyPanelData | null {
  if (
    state.netrw?.isOpen ||
    state.fuzzyFinder?.isOpen ||
    state.helpSession?.isOpen ||
    state.cmdlineWindow ||
    state.lspRename?.isOpen ||
    state.lspCodeActionMenu?.isOpen ||
    state.confirmSubstitute
  ) {
    return null;
  }

  // 1. Insert 모드 Ctrl-x 완성 서브모드
  if (state.mode === 'INSERT' && state.insertCtrlXMode) {
    return {
      prefix: 'Ctrl-x',
      titleKo: 'Insert 자동완성 (^X 모드)',
      titleEn: 'Insert Completion (^X mode)',
      items: INSERT_CTRL_X_ITEMS,
    };
  }

  // 2. Insert 모드 Ctrl-r 레지스터 삽입 대기
  if (state.mode === 'INSERT' && state.insertRegisterPending) {
    return {
      prefix: 'Ctrl-r',
      titleKo: '레지스터 삽입',
      titleEn: 'Insert Register',
      items: INSERT_CTRL_R_ITEMS,
    };
  }

  // 3. 사용자 정의 다중 키 매핑 접두어 대기 (<leader> 등)
  const customPrefix = state.pendingKeymapPrefix;
  if (customPrefix) {
    const modeChar: 'n' | 'v' | 's' | 'i' =
      state.mode === 'INSERT'
        ? 'i'
        : state.mode.startsWith('SELECT')
          ? 's'
          : state.mode.startsWith('VISUAL')
            ? 'v'
            : 'n';
    const customItems = collectCustomKeymapItems(state, modeChar, customPrefix);
    if (customItems.length > 0) {
      const displayPrefix = customPrefix === (state.leaderKey || ' ') ? '<leader>' : customPrefix;
      return {
        prefix: displayPrefix,
        titleKo: '사용자 정의 매핑',
        titleEn: 'Custom Keymaps',
        items: customItems,
      };
    }
  }

  const rawPending = state.pendingKeys;
  if (!rawPending) return null;

  // 앞의 숫자 카운트 제거 (예: '2d' -> 'd', '3]' -> ']')
  const stripped = rawPending.replace(/^[1-9][0-9]*/, '');
  if (!stripped) return null;

  const modeChar: 'n' | 'v' | 's' | 'i' =
    state.mode === 'INSERT'
      ? 'i'
      : state.mode.startsWith('SELECT')
        ? 's'
        : state.mode.startsWith('VISUAL')
          ? 'v'
          : 'n';
  const customForPending = collectCustomKeymapItems(state, modeChar, stripped);

  const withCustom = (base: WhichKeyPanelData): WhichKeyPanelData => {
    if (customForPending.length === 0) return base;
    const existingKeys = new Set(base.items.map((it) => it.key));
    const extras = customForPending.filter((c) => !existingKeys.has(c.key));
    return extras.length > 0 ? { ...base, items: [...base.items, ...extras] } : base;
  };

  if (stripped === 'g') {
    return withCustom({
      prefix: 'g',
      titleKo: 'g 접두 명령 (이동 · LSP · 주석 · 탭)',
      titleEn: 'g Prefix (Goto · LSP · Comment · Tabs)',
      items: G_PREFIX_ITEMS,
    });
  }
  if (stripped === 'gr') {
    return withCustom({
      prefix: 'gr',
      titleKo: 'Neovim LSP 리팩토링 / 가상 치환',
      titleEn: 'Neovim LSP Refactor / Virtual Replace',
      items: GR_PREFIX_ITEMS,
    });
  }
  if (stripped === 'z') {
    return withCustom({
      prefix: 'z',
      titleKo: 'z 접두 명령 (폴딩 · 뷰포트 · 맞춤법)',
      titleEn: 'z Prefix (Folds · Viewport · Spell)',
      items: Z_PREFIX_ITEMS,
    });
  }
  if (stripped === ']') {
    return withCustom({
      prefix: ']',
      titleKo: '다음 항목 탐색 (])',
      titleEn: 'Next Target (])',
      items: RIGHT_BRACKET_ITEMS,
    });
  }
  if (stripped === '[') {
    return withCustom({
      prefix: '[',
      titleKo: '이전 항목 탐색 ([)',
      titleEn: 'Previous Target ([)',
      items: LEFT_BRACKET_ITEMS,
    });
  }
  if (stripped === 'Ctrl-w' || stripped === 'Ctrl+w') {
    return withCustom({
      prefix: 'Ctrl-w',
      titleKo: '윈도우 분할 · 포커스 제어',
      titleEn: 'Window Split & Focus',
      items: CTRL_W_ITEMS,
    });
  }
  if (stripped === '"') {
    return {
      prefix: '"',
      titleKo: '레지스터 선택',
      titleEn: 'Select Register',
      items: REGISTER_ITEMS,
    };
  }
  if (stripped === 'm' || stripped === "'" || stripped === '`') {
    return {
      prefix: stripped,
      titleKo: stripped === 'm' ? '마크 설정' : '마크로 점프',
      titleEn: stripped === 'm' ? 'Set Mark' : 'Jump to Mark',
      items: [
        { key: 'a-z', labelKo: '현재 버퍼 로컬 마크', labelEn: 'Local buffer mark' },
        { key: 'A-Z', labelKo: '프로젝트 전역 마크', labelEn: 'Global file mark' },
        ...(stripped !== 'm'
          ? [
              { key: stripped, labelKo: '직전 점프 위치', labelEn: 'Previous jump pos' },
              { key: '.', labelKo: '마지막 편집 위치', labelEn: 'Last change pos' },
              { key: '<', labelKo: '직전 선택 시작', labelEn: 'Last visual start' },
              { key: '>', labelKo: '직전 선택 끝', labelEn: 'Last visual end' },
            ]
          : []),
      ],
    };
  }
  if (stripped === 'ys' || stripped === 'cs' || stripped === 'ds') {
    return {
      prefix: stripped,
      titleKo: 'vim-surround 괄호·따옴표 편집',
      titleEn: 'vim-surround Edit',
      items: [
        ...(stripped === 'ys'
          ? [
              { key: 'iw', labelKo: '단어 감싸기', labelEn: 'Surround inner word' },
              { key: 's', labelKo: '현재 줄 전체 감싸기', labelEn: 'Surround whole line' },
            ]
          : []),
        { key: '"', labelKo: '큰따옴표 "..."', labelEn: 'Double quotes' },
        { key: "'", labelKo: "작은따옴표 '...'", labelEn: 'Single quotes' },
        { key: '(', labelKo: '소괄호 (...)', labelEn: 'Parentheses' },
        { key: '{', labelKo: '중괄호 {...}', labelEn: 'Curly braces' },
        { key: '[', labelKo: '대괄호 [...]', labelEn: 'Square brackets' },
        { key: 't', labelKo: 'HTML 태그', labelEn: 'HTML tag' },
      ],
    };
  }

  // mini.ai Next/Last 텍스트 객체 (din, dan, cil, cal, vin 등)
  if (/^(?:[dcy><=]|g[uU~cq])?[ia][nl]$/.test(stripped)) {
    const isNext = stripped.endsWith('n');
    return {
      prefix: stripped,
      titleKo: isNext ? 'mini.ai 다음 텍스트 객체 (Next)' : 'mini.ai 이전 텍스트 객체 (Last)',
      titleEn: isNext ? 'mini.ai Next Text Object' : 'mini.ai Last Text Object',
      items: [
        { key: '"', labelKo: '큰따옴표 "..."', labelEn: 'Double quotes' },
        { key: "'", labelKo: "작은따옴표 '...'", labelEn: 'Single quotes' },
        { key: '`', labelKo: '백틱 `...`', labelEn: 'Backticks' },
        { key: '(', labelKo: '소괄호 (...)', labelEn: 'Parentheses' },
        { key: '{', labelKo: '중괄호 {...}', labelEn: 'Curly braces' },
        { key: '[', labelKo: '대괄호 [...]', labelEn: 'Square brackets' },
        { key: '<', labelKo: '꺾쇠 <...>', labelEn: 'Angle brackets' },
      ],
    };
  }

  // 텍스트 객체 i / a (di, da, ci, ca, yi, ya, gci, >i, Visual i/a 등)
  if (/^(?:[dcy><=]|g[uU~cq])?[ia]$/.test(stripped)) {
    const isInner = stripped.endsWith('i');
    return {
      prefix: stripped,
      titleKo: isInner ? '내부 텍스트 객체 (inner)' : '외부 텍스트 객체 (around)',
      titleEn: isInner ? 'Inner Text Objects' : 'Around Text Objects',
      items: TEXT_OBJECT_ITEMS,
    };
  }

  // 연산자 대기 (d, c, y, >, <, =, gu, gU, g~, gc, gq)
  if (/^(?:[dcy><=]|g[uU~cq])$/.test(stripped)) {
    const isDCY = stripped === 'd' || stripped === 'c' || stripped === 'y';
    const opNameKo =
      stripped === 'd'
        ? '삭제 (delete)'
        : stripped === 'c'
          ? '변경 (change)'
          : stripped === 'y'
            ? '복사 (yank)'
            : stripped === '>'
              ? '들여쓰기'
              : stripped === '<'
                ? '내어쓰기'
                : stripped === '='
                  ? '자동 정렬'
                  : stripped === 'gc'
                    ? '주석 토글'
                    : stripped === 'gq'
                      ? '줄바꿈 포매팅'
                      : '대소문자 변환';
    const opNameEn =
      stripped === 'd'
        ? 'Delete Operator'
        : stripped === 'c'
          ? 'Change Operator'
          : stripped === 'y'
            ? 'Yank Operator'
            : stripped === '>'
              ? 'Indent Operator'
              : stripped === '<'
                ? 'Dedent Operator'
                : stripped === '='
                  ? 'Auto-Indent Operator'
                  : stripped === 'gc'
                    ? 'Comment Operator'
                    : stripped === 'gq'
                      ? 'Format Operator'
                      : 'Case Operator';
    const lastChar = stripped[stripped.length - 1];
    return withCustom({
      prefix: stripped,
      titleKo: `${opNameKo} — 모션·텍스트 객체 대기`,
      titleEn: `${opNameEn} — Motion / Text Object`,
      items: [
        { key: lastChar, labelKo: '현재 줄 전체', labelEn: 'Current line' },
        { key: 'i', labelKo: '+내부 텍스트 객체', labelEn: '+Inner text object', group: true },
        { key: 'a', labelKo: '+외부 텍스트 객체', labelEn: '+Around text object', group: true },
        { key: 'w', labelKo: '다음 단어까지', labelEn: 'To next word' },
        { key: 'e', labelKo: '단어 끝까지', labelEn: 'To word end' },
        { key: '$', labelKo: '줄 끝까지', labelEn: 'To end of line' },
        { key: '0', labelKo: '줄 처음까지', labelEn: 'To line start' },
        { key: 'f', labelKo: '문자 포함 이동', labelEn: 'Find char' },
        { key: 't', labelKo: '문자 직전 이동', labelEn: 'Till char' },
        ...(isDCY
          ? [
              { key: 'v', labelKo: '문자 단위 강제', labelEn: 'Force charwise' },
              { key: 'V', labelKo: '줄 단위 강제', labelEn: 'Force linewise' },
              { key: 'Ctrl-v', labelKo: '블록 단위 강제', labelEn: 'Force blockwise' },
            ]
          : []),
        ...(stripped === 'y' ? [{ key: 's', labelKo: '+서라운드 감싸기', labelEn: '+Surround', group: true }] : []),
      ],
    });
  }

  // 사용자 정의 매핑만 일치하는 임의 접두어 (예: <leader>)
  if (customForPending.length > 0) {
    const displayPrefix =
      stripped === '<leader>' || stripped === (state.leaderKey || ' ') ? '<leader>' : stripped;
    return {
      prefix: displayPrefix,
      titleKo: '사용자 정의 매핑',
      titleEn: 'Custom Keymaps',
      items: customForPending,
    };
  }

  return null;
}
