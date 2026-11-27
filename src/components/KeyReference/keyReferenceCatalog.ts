import {
  CTRL_W_ITEMS,
  G_PREFIX_ITEMS,
  LEFT_BRACKET_ITEMS,
  REGISTER_ITEMS,
  RIGHT_BRACKET_ITEMS,
  TEXT_OBJECT_ITEMS,
  WhichKeyItem,
  Z_PREFIX_ITEMS,
} from '../WhichKey/whichKeyCatalog';

export type KeyReferenceCategory =
  | 'motion'
  | 'edit'
  | 'insert'
  | 'operator'
  | 'search'
  | 'visual'
  | 'other';

/** 노멀 모드에서 키 하나(또는 Ctrl 조합)를 눌렀을 때의 동작 */
export interface KeyReferenceEntry {
  /** 표시·매칭용 키 이름 (`h`, `H`, `$`, `Ctrl-a`, `Esc`, `Enter`) */
  key: string;
  category: KeyReferenceCategory;
  ko: string;
  en: string;
  /** 이 키 다음에 이어지는 키 목록 (g, z, [, ], Ctrl-w, ", 연산자) */
  followUps?: readonly WhichKeyItem[];
}

export const KEY_REFERENCE_CATEGORIES: ReadonlyArray<{
  id: KeyReferenceCategory;
  ko: string;
  en: string;
}> = [
  { id: 'motion', ko: '이동', en: 'Motion' },
  { id: 'edit', ko: '편집', en: 'Edit' },
  { id: 'insert', ko: '입력 모드 진입', en: 'Enter Insert' },
  { id: 'operator', ko: '연산자', en: 'Operators' },
  { id: 'search', ko: '검색', en: 'Search' },
  { id: 'visual', ko: '비주얼 · 선택', en: 'Visual' },
  { id: 'other', ko: '창 · 마크 · 레지스터 · 기타', en: 'Windows · marks · registers · misc' },
];

/** 연산자 뒤에 오는 텍스트 객체 목록 (`i`/`a` + 객체) */
const OPERATOR_FOLLOW_UPS: readonly WhichKeyItem[] = [
  { key: '{motion}', labelKo: '모션 범위 (w, $, j, G, f{c} …)', labelEn: 'Motion range (w, $, j, G, f{c} …)' },
  { key: 'i / a', labelKo: '+텍스트 객체 (안쪽 / 바깥쪽)', labelEn: '+Text object (inner / around)', group: true },
  ...TEXT_OBJECT_ITEMS.map((item) => ({
    ...item,
    key: `i${item.key} / a${item.key}`,
  })),
];

export const KEY_REFERENCE_ENTRIES: readonly KeyReferenceEntry[] = [
  // ---- 이동 ----
  { key: 'h', category: 'motion', ko: '왼쪽으로 한 칸', en: 'Left one character' },
  { key: 'j', category: 'motion', ko: '아래 줄로 (기억한 열 유지)', en: 'Down one line (keeps the remembered column)' },
  { key: 'k', category: 'motion', ko: '위 줄로 (기억한 열 유지)', en: 'Up one line (keeps the remembered column)' },
  { key: 'l', category: 'motion', ko: '오른쪽으로 한 칸', en: 'Right one character' },
  { key: 'w', category: 'motion', ko: '다음 단어 시작', en: 'Start of next word' },
  { key: 'W', category: 'motion', ko: '다음 WORD(공백으로 나뉜 덩어리) 시작', en: 'Start of next WORD (blank-separated)' },
  { key: 'b', category: 'motion', ko: '이전 단어 시작', en: 'Start of previous word' },
  { key: 'B', category: 'motion', ko: '이전 WORD 시작', en: 'Start of previous WORD' },
  { key: 'e', category: 'motion', ko: '단어 끝', en: 'End of word' },
  { key: 'E', category: 'motion', ko: 'WORD 끝', en: 'End of WORD' },
  { key: '0', category: 'motion', ko: '줄 맨 앞 (숫자 뒤에서는 카운트)', en: 'Start of line (a count after another digit)' },
  { key: '^', category: 'motion', ko: '줄의 첫 비공백 문자', en: 'First non-blank of the line' },
  { key: '$', category: 'motion', ko: '줄 끝', en: 'End of line' },
  { key: '|', category: 'motion', ko: '[count] 번째 열로', en: 'To column [count]' },
  { key: 'f', category: 'motion', ko: 'f{문자}: 줄에서 오른쪽 문자 위로', en: 'f{char}: to the next {char} on the line' },
  { key: 'F', category: 'motion', ko: 'F{문자}: 줄에서 왼쪽 문자 위로', en: 'F{char}: to the previous {char} on the line' },
  { key: 't', category: 'motion', ko: 't{문자}: 오른쪽 문자 바로 앞까지', en: 't{char}: till before the next {char}' },
  { key: 'T', category: 'motion', ko: 'T{문자}: 왼쪽 문자 바로 뒤까지', en: 'T{char}: till after the previous {char}' },
  { key: ';', category: 'motion', ko: '직전 f/F/t/T 같은 방향 반복', en: 'Repeat last f/F/t/T' },
  { key: ',', category: 'motion', ko: '직전 f/F/t/T 반대 방향 반복', en: 'Repeat last f/F/t/T backwards' },
  { key: 'G', category: 'motion', ko: '마지막 줄 ([count]G 는 그 줄)', en: 'Last line ([count]G goes to that line)' },
  { key: 'g', category: 'motion', ko: '+g 접두 명령 (gg 맨 위, gu 소문자 …)', en: '+g prefix (gg top, gu lowercase …)', followUps: G_PREFIX_ITEMS },
  { key: '{', category: 'motion', ko: '이전 빈 줄 (문단 위)', en: 'Previous blank line (paragraph up)' },
  { key: '}', category: 'motion', ko: '다음 빈 줄 (문단 아래)', en: 'Next blank line (paragraph down)' },
  { key: '(', category: 'motion', ko: '이전 문장 시작', en: 'Start of previous sentence' },
  { key: ')', category: 'motion', ko: '다음 문장 시작', en: 'Start of next sentence' },
  { key: '%', category: 'motion', ko: '짝 괄호로 ([count]% 는 파일의 N% 위치)', en: 'Matching bracket ([count]% goes N% into the file)' },
  { key: 'H', category: 'motion', ko: '화면 맨 위 줄', en: 'Top line of the screen' },
  { key: 'M', category: 'motion', ko: '화면 가운데 줄', en: 'Middle line of the screen' },
  { key: 'L', category: 'motion', ko: '화면 맨 아래 줄', en: 'Bottom line of the screen' },
  { key: '+', category: 'motion', ko: '다음 줄 첫 비공백', en: 'First non-blank of the next line' },
  { key: '-', category: 'motion', ko: '이전 줄 첫 비공백', en: 'First non-blank of the previous line' },
  { key: '_', category: 'motion', ko: '현재 줄 첫 비공백 ([count]-1 줄 아래)', en: 'First non-blank of the line ([count]-1 lines down)' },
  { key: 'Enter', category: 'motion', ko: '다음 줄 첫 비공백', en: 'First non-blank of the next line' },
  { key: '[', category: 'motion', ko: '+[ 접두 이동 (이전 진단·Hunk·짝 없는 괄호 …)', en: '+[ prefix (previous diagnostic, hunk, bracket …)', followUps: LEFT_BRACKET_ITEMS },
  { key: ']', category: 'motion', ko: '+] 접두 이동 (다음 진단·Hunk·짝 없는 괄호 …)', en: '+] prefix (next diagnostic, hunk, bracket …)', followUps: RIGHT_BRACKET_ITEMS },
  { key: 'Ctrl-d', category: 'motion', ko: '반 화면 아래로 스크롤', en: 'Scroll half a screen down' },
  { key: 'Ctrl-u', category: 'motion', ko: '반 화면 위로 스크롤', en: 'Scroll half a screen up' },
  { key: 'Ctrl-f', category: 'motion', ko: '한 화면 아래로', en: 'Scroll a screen down' },
  { key: 'Ctrl-b', category: 'motion', ko: '한 화면 위로', en: 'Scroll a screen up' },
  { key: 'Ctrl-e', category: 'motion', ko: '화면을 한 줄 아래로 (커서 유지)', en: 'Scroll the view one line down' },
  { key: 'Ctrl-y', category: 'motion', ko: '화면을 한 줄 위로 (커서 유지)', en: 'Scroll the view one line up' },
  { key: 'Ctrl-o', category: 'motion', ko: '점프 리스트에서 이전 위치로', en: 'Older position in the jump list' },
  { key: 'Ctrl-i', category: 'motion', ko: '점프 리스트에서 다음 위치로', en: 'Newer position in the jump list' },
  { key: 'z', category: 'motion', ko: '+z 접두 명령 (폴드, 화면 정렬 zz/zt/zb, 맞춤법)', en: '+z prefix (folds, zz/zt/zb, spelling)', followUps: Z_PREFIX_ITEMS },

  // ---- 편집 ----
  { key: 'x', category: 'edit', ko: '커서 글자 삭제', en: 'Delete the character under the cursor' },
  { key: 'X', category: 'edit', ko: '커서 왼쪽 글자 삭제', en: 'Delete the character before the cursor' },
  { key: 'r', category: 'edit', ko: 'r{문자}: 커서 글자를 바꾸기', en: 'r{char}: replace the character under the cursor' },
  { key: 'R', category: 'edit', ko: '덮어쓰기(REPLACE) 모드', en: 'Replace mode' },
  { key: 's', category: 'edit', ko: '커서 글자를 지우고 입력', en: 'Delete the character and insert' },
  { key: 'S', category: 'edit', ko: '줄 내용을 지우고 입력', en: 'Delete the line text and insert' },
  { key: 'C', category: 'edit', ko: '줄 끝까지 지우고 입력', en: 'Change to end of line' },
  { key: 'D', category: 'edit', ko: '줄 끝까지 삭제', en: 'Delete to end of line' },
  { key: 'Y', category: 'edit', ko: '줄 복사 (yy 와 같음)', en: 'Yank the line (same as yy)' },
  { key: 'p', category: 'edit', ko: '커서 뒤(줄 단위면 아래)에 붙여넣기', en: 'Put after the cursor (below for lines)' },
  { key: 'P', category: 'edit', ko: '커서 앞(줄 단위면 위)에 붙여넣기', en: 'Put before the cursor (above for lines)' },
  { key: 'J', category: 'edit', ko: '아래 줄과 공백 하나로 합치기', en: 'Join with the next line, adding one space' },
  { key: '~', category: 'edit', ko: '커서 글자 대소문자 바꾸고 오른쪽으로', en: 'Toggle case and move right' },
  { key: 'u', category: 'edit', ko: '실행 취소', en: 'Undo' },
  { key: 'U', category: 'edit', ko: '현재 줄의 변경을 한꺼번에 취소', en: 'Undo all changes on the line' },
  { key: 'Ctrl-r', category: 'edit', ko: '다시 실행 (redo)', en: 'Redo' },
  { key: '.', category: 'edit', ko: '직전 변경 반복', en: 'Repeat the last change' },
  { key: 'Ctrl-a', category: 'edit', ko: '커서 위치 또는 뒤의 숫자 +1 ([count] 만큼)', en: 'Increment the number at or after the cursor' },
  { key: 'Ctrl-x', category: 'edit', ko: '커서 위치 또는 뒤의 숫자 -1', en: 'Decrement the number at or after the cursor' },
  { key: '&', category: 'edit', ko: '직전 :s 치환을 현재 줄에 반복', en: 'Repeat the last :s on this line' },

  // ---- 입력 모드 진입 ----
  { key: 'i', category: 'insert', ko: '커서 앞에서 입력', en: 'Insert before the cursor' },
  { key: 'a', category: 'insert', ko: '커서 뒤에서 입력', en: 'Append after the cursor' },
  { key: 'I', category: 'insert', ko: '줄의 첫 비공백 앞에서 입력', en: 'Insert at the first non-blank' },
  { key: 'A', category: 'insert', ko: '줄 끝에서 입력', en: 'Append at end of line' },
  { key: 'o', category: 'insert', ko: '아래에 새 줄을 열고 입력', en: 'Open a line below' },
  { key: 'O', category: 'insert', ko: '위에 새 줄을 열고 입력', en: 'Open a line above' },
  { key: 'Esc', category: 'insert', ko: '노멀 모드로 돌아가기 / 대기 중인 명령 취소', en: 'Back to Normal mode / cancel a pending command' },

  // ---- 연산자 ----
  { key: 'd', category: 'operator', ko: 'd{모션}: 삭제 (dd 줄 삭제)', en: 'd{motion}: delete (dd deletes the line)', followUps: OPERATOR_FOLLOW_UPS },
  { key: 'c', category: 'operator', ko: 'c{모션}: 지우고 입력 (cc 줄 바꾸기)', en: 'c{motion}: change (cc changes the line)', followUps: OPERATOR_FOLLOW_UPS },
  { key: 'y', category: 'operator', ko: 'y{모션}: 복사 (yy 줄 복사)', en: 'y{motion}: yank (yy yanks the line)', followUps: OPERATOR_FOLLOW_UPS },
  { key: '>', category: 'operator', ko: '>{모션}: 들여쓰기 (>> 현재 줄)', en: '>{motion}: indent (>> this line)', followUps: OPERATOR_FOLLOW_UPS },
  { key: '<', category: 'operator', ko: '<{모션}: 내어쓰기 (<< 현재 줄)', en: '<{motion}: outdent (<< this line)', followUps: OPERATOR_FOLLOW_UPS },
  { key: '=', category: 'operator', ko: '={모션}: 자동 들여쓰기 (== 현재 줄)', en: '={motion}: re-indent (== this line)', followUps: OPERATOR_FOLLOW_UPS },
  { key: '!', category: 'operator', ko: '!{모션}: 셸 명령으로 걸러내기', en: '!{motion}: filter through a shell command' },

  // ---- 검색 ----
  { key: '/', category: 'search', ko: '/패턴: 아래로 검색', en: '/pattern: search forward' },
  { key: '?', category: 'search', ko: '?패턴: 위로 검색', en: '?pattern: search backward' },
  { key: 'n', category: 'search', ko: '같은 방향으로 다음 매치', en: 'Next match in the same direction' },
  { key: 'N', category: 'search', ko: '반대 방향으로 다음 매치', en: 'Next match in the opposite direction' },
  { key: '*', category: 'search', ko: '커서(또는 그 뒤) 단어를 아래로 검색', en: 'Search forward for the word under (or after) the cursor' },
  { key: '#', category: 'search', ko: '커서(또는 그 뒤) 단어를 위로 검색', en: 'Search backward for the word under (or after) the cursor' },
  { key: ':', category: 'search', ko: 'Ex 명령줄 (:s 치환, :w 저장, :help …)', en: 'Ex command line (:s, :w, :help …)' },

  // ---- 비주얼 ----
  { key: 'v', category: 'visual', ko: '글자 단위 비주얼 선택', en: 'Characterwise Visual mode' },
  { key: 'V', category: 'visual', ko: '줄 단위 비주얼 선택', en: 'Linewise Visual mode' },
  { key: 'Ctrl-v', category: 'visual', ko: '블록(사각형) 비주얼 선택', en: 'Blockwise Visual mode' },

  // ---- 창 · 마크 · 레지스터 · 기타 ----
  { key: 'm', category: 'other', ko: 'm{a-z}: 마크 저장 (대문자는 파일 간 마크)', en: 'm{a-z}: set a mark (uppercase marks work across files)' },
  { key: "'", category: 'other', ko: "'{마크}: 마크한 줄의 첫 비공백으로", en: "'{mark}: first non-blank of the marked line" },
  { key: '`', category: 'other', ko: '`{마크}: 마크한 정확한 위치로', en: '`{mark}: exact marked position' },
  { key: '"', category: 'other', ko: '"{레지스터}: 다음 명령이 쓸 레지스터 지정', en: '"{register}: use a register for the next command', followUps: REGISTER_ITEMS },
  { key: 'q', category: 'other', ko: 'q{a-z}: 매크로 녹화 시작/끝 (q: 명령 이력 창)', en: 'q{a-z}: record a macro / stop (q: command history)' },
  { key: '@', category: 'other', ko: '@{a-z}: 매크로 실행 (@@ 직전 매크로, @: 직전 Ex)', en: '@{a-z}: run a macro (@@ last macro, @: last Ex command)' },
  { key: 'Q', category: 'other', ko: '마지막으로 녹화한 매크로 실행', en: 'Run the last recorded macro' },
  { key: 'Ctrl-w', category: 'other', ko: '+창 명령 (분할·이동·닫기)', en: '+Window commands (split, move, close)', followUps: CTRL_W_ITEMS },
  { key: 'Ctrl-^', category: 'other', ko: '직전에 보던 파일로 전환', en: 'Switch to the alternate file' },
  { key: 'Ctrl-]', category: 'other', ko: '커서 단어의 태그(정의)로 점프', en: 'Jump to the tag under the cursor' },
  { key: 'Ctrl-t', category: 'other', ko: '태그 점프 이전 위치로 복귀', en: 'Jump back from a tag' },
  { key: 'Ctrl-g', category: 'other', ko: '파일 이름과 위치 정보 표시', en: 'Show file name and position' },
  { key: 'K', category: 'other', ko: '커서 단어의 도움말 / LSP 설명', en: 'Help or LSP hover for the word under the cursor' },
  { key: 'F1', category: 'other', ko: 'Vim 도움말 창 열기', en: 'Open Vim help' },
  { key: 'Z', category: 'other', ko: 'ZZ 저장 후 닫기 / ZQ 저장 없이 닫기', en: 'ZZ save and close / ZQ close without saving' },
  { key: 'Space', category: 'other', ko: '오른쪽으로 한 칸 (리더 키로 많이 씀)', en: 'Right one character (often the leader key)' },
  { key: 'Backspace', category: 'other', ko: '왼쪽으로 한 칸', en: 'Left one character' },
];

const ENTRY_BY_KEY = new Map(KEY_REFERENCE_ENTRIES.map((entry) => [entry.key, entry]));

export function findKeyReferenceEntry(key: string): KeyReferenceEntry | undefined {
  return ENTRY_BY_KEY.get(key);
}

const NAMED_KEYS: Record<string, string> = {
  Escape: 'Esc',
  ' ': 'Space',
  Enter: 'Enter',
  Backspace: 'Backspace',
  F1: 'F1',
  Tab: 'Ctrl-i',
};

/**
 * 키 사전 창에서 누른 키를 사전 키 이름으로 바꿉니다. 사전에서 찾을 대상이 아니면 null.
 * (Ctrl+/ 는 창을 닫는 키라 여기서는 다루지 않습니다)
 */
export function keyNameFromEvent(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>): string | null {
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Process'].includes(e.key)) return null;
  if (e.ctrlKey || e.metaKey) {
    if (e.altKey) return null;
    if (e.key === '^' || e.key === '6' || e.code === 'Digit6') return 'Ctrl-^';
    if (e.key === ']' || e.code === 'BracketRight') return 'Ctrl-]';
    const letter = /^Key([A-Z])$/.exec(e.code)?.[1]?.toLowerCase() ?? e.key.toLowerCase();
    return /^[a-z]$/.test(letter) ? `Ctrl-${letter}` : null;
  }
  if (e.altKey) return null;
  if (NAMED_KEYS[e.key]) return NAMED_KEYS[e.key];
  return e.key.length === 1 ? e.key : null;
}
