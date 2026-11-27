import {
  CTRL_W_ITEMS,
  G_PREFIX_ITEMS,
  INSERT_CTRL_R_ITEMS,
  INSERT_CTRL_X_ITEMS,
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
  | 'other'
  | 'visual-select'
  | 'visual-edit'
  | 'insert-delete'
  | 'insert-put'
  | 'insert-move';

/** 키 사전의 모드 탭 */
export type KeyReferenceMode = 'normal' | 'visual' | 'insert';

/** 한 모드에서 키 하나(또는 Ctrl 조합)를 눌렀을 때의 동작 */
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
  { id: 'visual-select', ko: '선택 범위 조절', en: 'Adjust the selection' },
  { id: 'visual-edit', ko: '선택한 텍스트 편집', en: 'Edit the selection' },
  { id: 'insert-delete', ko: '지우기', en: 'Delete' },
  { id: 'insert-put', ko: '넣기 · 자동완성', en: 'Insert & complete' },
  { id: 'insert-move', ko: '이동 · 모드 전환', en: 'Move & switch modes' },
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

/** 노멀 모드 키 */
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
  { key: 'Ctrl-w', category: 'other', ko: '+창 명령 (분할·이동·닫기). 브라우저에서는 Alt+W 로 누르세요 (Ctrl+W 는 탭을 닫음)', en: '+Window commands (split, move, close). In the browser press Alt+W (Ctrl+W closes the tab)', followUps: CTRL_W_ITEMS },
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

/** 비주얼 모드(v / V / Ctrl-v) 키 */
export const VISUAL_KEY_ENTRIES: readonly KeyReferenceEntry[] = [
  { key: 'o', category: 'visual-select', ko: '선택의 반대쪽 끝으로 커서 옮기기', en: 'Move to the other end of the selection' },
  { key: 'O', category: 'visual-select', ko: '블록 선택에서 같은 줄의 반대쪽 모서리로', en: 'Blockwise: other corner on the same line' },
  { key: 'i', category: 'visual-select', ko: 'i{객체}: 텍스트 객체 안쪽을 선택 (viw, vi")', en: 'i{object}: select inside a text object (viw, vi")', followUps: TEXT_OBJECT_ITEMS },
  { key: 'a', category: 'visual-select', ko: 'a{객체}: 텍스트 객체를 감싼 것까지 선택 (vaw, va()', en: 'a{object}: select around a text object (vaw, va()', followUps: TEXT_OBJECT_ITEMS },
  { key: '$', category: 'visual-select', ko: '줄 끝까지 선택 (블록이면 줄마다 끝까지)', en: 'Extend to end of line (each line in block mode)' },
  { key: 'v', category: 'visual-select', ko: '글자 단위로 바꾸기 (이미 글자 단위면 끝내기)', en: 'Switch to characterwise (or leave it)' },
  { key: 'V', category: 'visual-select', ko: '줄 단위로 바꾸기 (이미 줄 단위면 끝내기)', en: 'Switch to linewise (or leave it)' },
  { key: 'Ctrl-v', category: 'visual-select', ko: '블록 단위로 바꾸기 (이미 블록이면 끝내기)', en: 'Switch to blockwise (or leave it)' },
  { key: 'Ctrl-g', category: 'visual-select', ko: '선택(Select) 모드로 바꾸기', en: 'Switch to Select mode' },
  { key: 'Esc', category: 'visual-select', ko: '선택 취소하고 노멀 모드로', en: 'Cancel the selection' },
  { key: 'd', category: 'visual-edit', ko: '선택 영역 삭제 (x 도 같음)', en: 'Delete the selection (same as x)' },
  { key: 'x', category: 'visual-edit', ko: '선택 영역 삭제', en: 'Delete the selection' },
  { key: 'c', category: 'visual-edit', ko: '선택 영역을 지우고 입력 (블록이면 줄마다)', en: 'Change the selection (on every line in block mode)' },
  { key: 's', category: 'visual-edit', ko: '선택 영역을 지우고 입력 (c 와 같음)', en: 'Change the selection (same as c)' },
  { key: 'y', category: 'visual-edit', ko: '선택 영역 복사', en: 'Yank the selection' },
  { key: 'p', category: 'visual-edit', ko: '선택 영역을 레지스터 내용으로 바꾸기', en: 'Replace the selection with a register' },
  { key: 'r', category: 'visual-edit', ko: 'r{문자}: 선택한 글자를 모두 그 문자로', en: 'r{char}: replace every selected character' },
  { key: '~', category: 'visual-edit', ko: '대소문자 바꾸기', en: 'Toggle case' },
  { key: 'u', category: 'visual-edit', ko: '소문자로', en: 'Lowercase' },
  { key: 'U', category: 'visual-edit', ko: '대문자로', en: 'Uppercase' },
  { key: '>', category: 'visual-edit', ko: '선택한 줄 들여쓰기', en: 'Indent the selected lines' },
  { key: '<', category: 'visual-edit', ko: '선택한 줄 내어쓰기', en: 'Outdent the selected lines' },
  { key: '=', category: 'visual-edit', ko: '선택한 줄 자동 들여쓰기', en: 'Re-indent the selected lines' },
  { key: 'J', category: 'visual-edit', ko: '선택한 줄을 공백으로 합치기 (gJ 는 공백 없이)', en: 'Join the selected lines (gJ without spaces)' },
  { key: 'I', category: 'visual-edit', ko: '블록 선택: 줄마다 블록 앞에 입력', en: 'Block: insert before the block on every line' },
  { key: 'A', category: 'visual-edit', ko: '블록 선택: 줄마다 블록 뒤에 입력', en: 'Block: append after the block on every line' },
  { key: ':', category: 'visual-edit', ko: "선택한 줄에 Ex 명령 (:'<,'>s/…)", en: "Ex command on the selected lines (:'<,'>s/…)" },
  { key: 'Ctrl-a', category: 'visual-edit', ko: '선택 안의 숫자 +1 (g Ctrl-a 는 1, 2, 3… 차례로)', en: 'Increment numbers (g Ctrl-a makes a sequence)' },
  { key: 'Ctrl-x', category: 'visual-edit', ko: '선택 안의 숫자 -1', en: 'Decrement numbers in the selection' },
  { key: 'g', category: 'visual-edit', ko: '+g 접두 명령 (gJ, gq, gc, gu, gU, g Ctrl-a …)', en: '+g prefix (gJ, gq, gc, gu, gU, g Ctrl-a …)', followUps: G_PREFIX_ITEMS },
];

/** 입력 모드(INSERT) 키 */
export const INSERT_KEY_ENTRIES: readonly KeyReferenceEntry[] = [
  { key: 'Backspace', category: 'insert-delete', ko: '앞 글자 지우기 (Ctrl-h 도 같음)', en: 'Delete the previous character (same as Ctrl-h)' },
  { key: 'Ctrl-h', category: 'insert-delete', ko: '앞 글자 지우기', en: 'Delete the previous character' },
  { key: 'Ctrl-w', category: 'insert-delete', ko: '앞 단어 지우기 (브라우저에서는 Alt+W)', en: 'Delete the previous word (Alt+W in the browser)' },
  { key: 'Ctrl-u', category: 'insert-delete', ko: '입력 시작점까지 지우기 (다시 누르면 줄 시작까지)', en: 'Delete back to where insert started (again: to line start)' },
  { key: 'Ctrl-r', category: 'insert-put', ko: 'Ctrl-r {레지스터}: 레지스터 내용 넣기 (Ctrl-r = 계산식)', en: 'Ctrl-r {register}: insert a register (Ctrl-r = for an expression)', followUps: INSERT_CTRL_R_ITEMS },
  { key: 'Ctrl-n', category: 'insert-put', ko: '자동완성: 다음 후보', en: 'Completion: next match' },
  { key: 'Ctrl-p', category: 'insert-put', ko: '자동완성: 이전 후보', en: 'Completion: previous match' },
  { key: 'Ctrl-x', category: 'insert-put', ko: '+자동완성 종류 고르기 (파일, 줄, 사전 …)', en: '+Choose a completion kind (file, line, dictionary …)', followUps: INSERT_CTRL_X_ITEMS },
  { key: 'Ctrl-Space', category: 'insert-put', ko: 'nvim-cmp 통합 자동완성 (스니펫·LSP·버퍼)', en: 'nvim-cmp completion (snippets, LSP, buffer)' },
  { key: 'Ctrl-a', category: 'insert-put', ko: '직전에 입력한 텍스트 다시 넣기 (Ctrl-@ 는 넣고 노멀로)', en: 'Insert the last inserted text again (Ctrl-@ then stops)' },
  { key: 'Ctrl-v', category: 'insert-put', ko: '다음 키를 글자 그대로 넣기 (Ctrl-v u0041 → 유니코드)', en: 'Insert the next key literally (Ctrl-v u0041 for Unicode)' },
  { key: 'Ctrl-k', category: 'insert-put', ko: 'Ctrl-k {두 글자}: 다이그래프 특수 문자 넣기', en: 'Ctrl-k {two chars}: insert a digraph' },
  { key: 'Ctrl-e', category: 'insert-put', ko: '아래 줄의 같은 열 글자 복사해 넣기', en: 'Copy the character below the cursor' },
  { key: 'Ctrl-y', category: 'insert-put', ko: '위 줄의 같은 열 글자 복사해 넣기', en: 'Copy the character above the cursor' },
  { key: 'Ctrl-t', category: 'insert-put', ko: '현재 줄 들여쓰기 한 단계', en: 'Indent the current line' },
  { key: 'Ctrl-d', category: 'insert-put', ko: '현재 줄 내어쓰기 한 단계 (0 Ctrl-d 는 모두)', en: 'Outdent the current line (0 Ctrl-d removes all)' },
  { key: 'Tab', category: 'insert-put', ko: '탭 / 공백 넣기 (스니펫 확장·다음 자리)', en: 'Insert a tab or spaces (expand snippet / next stop)' },
  { key: 'Enter', category: 'insert-put', ko: '줄 나누기', en: 'Break the line' },
  { key: 'Ctrl-]', category: 'insert-put', ko: '약어(:iabbrev) 바로 펼치기', en: 'Expand an abbreviation now' },
  { key: 'Esc', category: 'insert-move', ko: '노멀 모드로 (커서는 한 칸 왼쪽)', en: 'Back to Normal mode (cursor moves left one)' },
  { key: 'Ctrl-o', category: 'insert-move', ko: '노멀 명령 하나만 실행하고 입력 모드로 돌아오기', en: 'Run one Normal command, then return to Insert' },
  { key: 'Ctrl-g', category: 'insert-move', ko: 'Ctrl-g u: 실행 취소 단위 나누기 / j, k: 입력 시작 열로 위아래', en: 'Ctrl-g u: break undo / j, k: up or down to the insert column' },
  { key: 'ArrowLeft', category: 'insert-move', ko: '왼쪽으로 (실행 취소 단위가 나뉨)', en: 'Left (starts a new undo step)' },
  { key: 'ArrowRight', category: 'insert-move', ko: '오른쪽으로 (실행 취소 단위가 나뉨)', en: 'Right (starts a new undo step)' },
];

export const KEY_REFERENCE_MODES: ReadonlyArray<{
  id: KeyReferenceMode;
  ko: string;
  en: string;
  entries: readonly KeyReferenceEntry[];
}> = [
  { id: 'normal', ko: '노멀', en: 'Normal', entries: KEY_REFERENCE_ENTRIES },
  { id: 'visual', ko: '비주얼', en: 'Visual', entries: VISUAL_KEY_ENTRIES },
  { id: 'insert', ko: '입력', en: 'Insert', entries: INSERT_KEY_ENTRIES },
];

/** 에디터 모드에 맞는 키 사전 탭 */
export function keyReferenceModeFor(editorMode: string | undefined): KeyReferenceMode {
  if (editorMode?.startsWith('VISUAL') || editorMode?.startsWith('SELECT')) return 'visual';
  if (editorMode === 'INSERT' || editorMode === 'REPLACE') return 'insert';
  return 'normal';
}

const ENTRY_MAPS = new Map(
  KEY_REFERENCE_MODES.map((mode) => [mode.id, new Map(mode.entries.map((entry) => [entry.key, entry]))])
);

export function findKeyReferenceEntry(key: string, mode: KeyReferenceMode = 'normal'): KeyReferenceEntry | undefined {
  return ENTRY_MAPS.get(mode)?.get(key);
}

const NAMED_KEYS: Record<string, string> = {
  Escape: 'Esc',
  ' ': 'Space',
  Enter: 'Enter',
  Backspace: 'Backspace',
  F1: 'F1',
  Tab: 'Tab',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
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
    if (e.key === '@' || e.code === 'Digit2') return 'Ctrl-@';
    if (e.key === ' ' || e.code === 'Space') return 'Ctrl-Space';
    const letter = /^Key([A-Z])$/.exec(e.code)?.[1]?.toLowerCase() ?? e.key.toLowerCase();
    return /^[a-z]$/.test(letter) ? `Ctrl-${letter}` : null;
  }
  if (e.altKey) return null;
  if (NAMED_KEYS[e.key]) return NAMED_KEYS[e.key];
  return e.key.length === 1 ? e.key : null;
}
