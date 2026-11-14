import { describe, it, expect } from 'vitest';
import { MISSIONS } from './missions';
import { VimEditorState, SplitPaneState } from '../vim-engine';
import { handleKey } from '../vim-engine';
import { computeDiffHunks } from '../vim-engine';

describe('MISSIONS 10 ~ 12 validation', () => {
  it('레슨 10 (숫자 반복 카운트) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson10 = MISSIONS.find((m) => m.id === 10);
    expect(lesson10).toBeDefined();
    expect(lesson10?.par).toBe(5);

    // 완료되지 않은 상태
    const incompleteState: VimEditorState = {
      lines: ['Header line', 'REMOVE ME 1', 'REMOVE ME 2', 'one two three [GOAL]'],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson10!.checkComplete(incompleteState)).toBe(false);

    // 2dd 수행 후 3w로 [GOAL] 도달한 완료 상태
    const completeState: VimEditorState = {
      lines: ['Header line', 'one two three [GOAL]'],
      cursor: { line: 1, col: 14 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson10!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 11 (빠른 입력 모드 진입) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson11 = MISSIONS.find((m) => m.id === 11);
    expect(lesson11).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['Task 1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson11!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['Task 1 done', 'Vim is fast!'],
      cursor: { line: 1, col: 11 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson11!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 12 (단어 수정 및 교체) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson12 = MISSIONS.find((m) => m.id === 12);
    expect(lesson12).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['Vim is slow', 'A cute cwt'],
      cursor: { line: 0, col: 7 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson12!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['Vim is fast', 'A cute cat'],
      cursor: { line: 1, col: 9 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson12!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 13 (줄 내 문자 탐색 및 삭제) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson13 = MISSIONS.find((m) => m.id === 13);
    expect(lesson13).toBeDefined();
    expect(lesson13?.par).toBe(5);

    const stateNotDone: VimEditorState = {
      lines: ['console.log(unwanted, junk);'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson13!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['console.log;'],
      cursor: { line: 0, col: 11 },
      mode: 'NORMAL',
    };
    expect(lesson13!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 14 (텍스트 객체 수정 및 삭제) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson14 = MISSIONS.find((m) => m.id === 14);
    expect(lesson14).toBeDefined();
    expect(lesson14?.par).toBe(14);

    const stateNotDone: VimEditorState = {
      lines: ['let oldVariable = 200;', 'const msg = "delete this text";'],
      cursor: { line: 0, col: 4 },
      mode: 'NORMAL',
    };
    expect(lesson14!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['let status = 200;', 'const msg = "";'],
      cursor: { line: 1, col: 12 },
      mode: 'NORMAL',
    };
    expect(lesson14!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 15 (점 반복 편집 자동화) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson15 = MISSIONS.find((m) => m.id === 15);
    expect(lesson15).toBeDefined();
    expect(lesson15?.par).toBe(7);

    const stateNotDone: VimEditorState = {
      lines: ['const a = 1', 'const b = 2', 'const c = 3'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson15!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['const a = 1;', 'const b = 2;', 'const c = 3;'],
      cursor: { line: 2, col: 11 },
      mode: 'NORMAL',
    };
    expect(lesson15!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 16 (키워드 검색과 점프) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson16 = MISSIONS.find((m) => m.id === 16);
    expect(lesson16).toBeDefined();
    expect(lesson16?.par).toBe(10);

    const stateNotDone: VimEditorState = {
      lines: [
        'First line with target item.',
        'Second line without any match.',
        'Third line has another target here.',
        'Fourth line reaches the [FINAL_TARGET]!',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson16!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        'First line with target item.',
        'Second line without any match.',
        'Third line has another target here.',
        'Fourth line reaches the [FINAL_TARGET]!',
      ],
      cursor: { line: 3, col: 31 },
      mode: 'NORMAL',
    };
    expect(lesson16!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 17 (커맨드라인 일괄 치환) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson17 = MISSIONS.find((m) => m.id === 17);
    expect(lesson17).toBeDefined();
    expect(lesson17?.par).toBe(16);

    const stateNotDone: VimEditorState = {
      lines: [
        '1. TODO: Fix authentication bug',
        '2. TODO: Implement search feature',
        '3. TODO: Write comprehensive tests',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson17!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        '1. DONE: Fix authentication bug',
        '2. DONE: Implement search feature',
        '3. DONE: Write comprehensive tests',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson17!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 18 (매크로 녹화와 괄호 점프 %) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson18 = MISSIONS.find((m) => m.id === 18);
    expect(lesson18).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['const list = [', '  alpha', '  beta', '  gamma', '];'],
      cursor: { line: 0, col: 13 },
      mode: 'NORMAL',
    };
    expect(lesson18!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['const list = [', '  "alpha",', '  "beta",', '  "gamma",', '];'],
      cursor: { line: 3, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson18!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 19 (Ctrl+v 비주얼 블록 다중 줄 편집) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson19 = MISSIONS.find((m) => m.id === 19);
    expect(lesson19).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: [
        'const host = "localhost";',
        'const port = 8080;',
        'const debug = true;',
        'startServer();',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson19!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        '// const host = "localhost";',
        '// const port = 8080;',
        '// const debug = true;',
        'startServer();',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson19!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 20 (마크와 점프 리스트) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson20 = MISSIONS.find((m) => m.id === 20);
    expect(lesson20).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['function calculateTotal() {', '  return 100;', '}', '', '// End of file notes'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson20!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['function calculateTotal() {', '  return 100;', '}', '', '// End of file notes'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      marks: { a: { row: 0, col: 0 } },
      jumpList: [{ row: 0, col: 0 }, { row: 4, col: 0 }],
      jumpIndex: 1,
    };
    expect(lesson20!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 21 (실무 필수 라인/문자 편집) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson21 = MISSIONS.find((m) => m.id === 21);
    expect(lesson21).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: [
        'const version = 1;',
        'const message =',
        '  "hello vim";',
        'console.log(message);',
      ],
      cursor: { line: 0, col: 6 },
      mode: 'NORMAL',
    };
    expect(lesson21!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        'const Version = 2;',
        'const message = "hello vim";',
        '  console.log(message);',
      ],
      cursor: { line: 2, col: 2 },
      mode: 'NORMAL',
    };
    expect(lesson21!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 22 (:g 글로벌 명령과 :norm) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson22 = MISSIONS.find((m) => m.id === 22);
    expect(lesson22).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['const a = 1', 'console.log("debug")', 'const sum = a'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson22!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['const a = 1;', 'const b = 2;', 'const sum = a + b;'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson22!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 23 (블랙홀 레지스터 및 명명된 레지스터) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson23 = MISSIONS.find((m) => m.id === 23);
    expect(lesson23).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['const secret = "secretKey123";', 'const garbageLine = "DELETE_ME";', 'let authHeader = "";'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson23!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['const secret = "secretKey123";', 'let authHeader = "secretKey123";'],
      cursor: { line: 1, col: 17 },
      mode: 'NORMAL',
      registers: {
        a: { type: 'char', content: 'secretKey123' },
      },
    };
    expect(lesson23!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 24 (:vsp 화면 분할과 창 간 코드 이동) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson24 = MISSIONS.find((m) => m.id === 24);
    expect(lesson24).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['// Refactored Target'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson24!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        '// Refactored Target',
        'export function helperA() { return "A"; }',
        'export function helperB() { return "B"; }',
      ],
      cursor: { line: 2, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson24!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 25 (cit로 JSX 태그 편집하고 gg=G로 들여쓰기 정렬) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson25 = MISSIONS.find((m) => m.id === 25);
    expect(lesson25).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: [
        'function App() {',
        'const title = "Vim";',
        'return (',
        '<button>Old</button>',
        ');',
        '}',
      ],
      cursor: { line: 3, col: 8 },
      mode: 'NORMAL',
    };
    expect(lesson25!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        'function App() {',
        '  const title = "Vim";',
        '  return (',
        '    <button>Click Me</button>',
        '  );',
        '}',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson25!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 26 (Insert 모드 Ctrl+w 단어 삭제 및 Ctrl+n 자동완성) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson26 = MISSIONS.find((m) => m.id === 26);
    expect(lesson26).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: [
        'const calculateTotalHospitalPrescriptionPrice = 12000;',
        'const currentTotal = wrongWord',
      ],
      cursor: { line: 1, col: 29 },
      mode: 'NORMAL',
    };
    expect(lesson26!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        'const calculateTotalHospitalPrescriptionPrice = 12000;',
        'const currentTotal = calculateTotalHospitalPrescriptionPrice;',
      ],
      cursor: { line: 1, col: 60 },
      mode: 'NORMAL',
    };
    expect(lesson26!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 27 ({} 문단 점프와 gi로 편집 위치 복귀) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson27 = MISSIONS.find((m) => m.id === 27);
    expect(lesson27).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: [
        '// Header 1: Configuration',
        'const MAX_RETRIES = 3;',
        '',
        '// Header 2: Client Instance',
        'const client = new ApiClient()',
      ],
      cursor: { line: 4, col: 30 },
      mode: 'NORMAL',
    };
    expect(lesson27!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        '// Header 1: Configuration',
        'const MAX_RETRIES = 3;',
        '',
        '// Header 2: Client Instance',
        'const client = new ApiClient();',
      ],
      cursor: { line: 4, col: 31 },
      mode: 'NORMAL',
    };
    expect(lesson27!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 28: 캡처 그룹 \\1, \\2와 \\u로 snake_case 코드를 camelCase로 리팩토링하기 완료 조건 검증', () => {
    const lesson28 = MISSIONS.find((m) => m.id === 28);
    expect(lesson28).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: [
        'function get_user() {',
        '  const user = get_account();',
        '  return get_profile(user);',
        '}',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson28!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        'function getUser() {',
        '  const user = getAccount();',
        '  return getProfile(user);',
        '}',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson28!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 29: Ctrl+r 0 및 Ctrl+r = 완료 조건 검증', () => {
    const lesson29 = MISSIONS.find((m) => m.id === 29);
    expect(lesson29).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['const CHUNK_SIZE = 1024;', 'const maxBytes = '],
      cursor: { line: 1, col: 17 },
      mode: 'NORMAL',
    };
    expect(lesson29!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['const CHUNK_SIZE = 1024;', 'const maxBytes = CHUNK_SIZE * 65536;'],
      cursor: { line: 1, col: 35 },
      mode: 'NORMAL',
    };
    expect(lesson29!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 30: cgn 및 /pattern/e 완료 조건 검증', () => {
    const lesson30 = MISSIONS.find((m) => m.id === 30);
    expect(lesson30).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: [
        'const oldVal = 10;',
        'const tempVal = oldVal + 5;',
        'const finalVal = oldVal * 2;',
        'function processValue() {}',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson30!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        'const newVal = 10;',
        'const tempVal = newVal + 5;',
        'const finalVal = newVal * 2;',
        'function processValues() {}',
      ],
      cursor: { line: 3, col: 23 },
      mode: 'NORMAL',
    };
    expect(lesson30!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 31: 대문자 "A 누적 복사 및 qA 매크로 덧붙이기 완료 조건 검증', () => {
    const lesson31 = MISSIONS.find((m) => m.id === 31);
    expect(lesson31).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['const port = 3000;', 'const debug = true;'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson31!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        '// const port = 3000;',
        '// const debug = true;',
        '// const host = "localhost";',
        '',
        '// TARGET BUNDLE:',
        'const port = 3000;',
        'const host = "localhost";',
      ],
      cursor: { line: 2, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson31!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 32: g Ctrl+a 및 :sort u 완료 조건 검증', () => {
    const lesson32 = MISSIONS.find((m) => m.id === 32);
    expect(lesson32).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['data_0', 'data_0', 'data_0', 'cherry', 'apple', 'banana', 'cherry'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson32!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['data_1', 'data_2', 'data_3', 'apple', 'banana', 'cherry'],
      cursor: { line: 3, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson32!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 33: :bnext, :bprev 및 Ctrl-^ 완료 조건 검증', () => {
    const lesson33 = MISSIONS.find((m) => m.id === 33);
    expect(lesson33).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['const API_VERSION = 1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson33!.checkComplete(stateNotDone)).toBe(false);
  });

  it('레슨 34: :tabnew, :tabclose 및 gt/gT 완료 조건 검증', () => {
    const lesson34 = MISSIONS.find((m) => m.id === 34);
    expect(lesson34).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['const STAGE = 1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson34!.checkComplete(stateNotDone)).toBe(false);
  });

  it('레슨 35: q: 커맨드라인 윈도우 및 히스토리 재사용 완료 조건 검증', () => {
    const lesson35 = MISSIONS.find((m) => m.id === 35);
    expect(lesson35).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['mode: DEBUG', 'target: DEBUG'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson35!.checkComplete(stateNotDone)).toBe(false);
  });

  it('레슨 36: 퀵픽스(Quickfix: :cc, :cn, :copen) 완료 조건 검증', () => {
    const lesson36 = MISSIONS.find((m) => m.id === 36);
    expect(lesson36).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['flag1 = BAD', 'flag2 = BAD'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson36!.checkComplete(stateNotDone)).toBe(false);
  });

  it('레슨 37: 체인지 리스트(Change List: g;, g,, :changes) 완료 조건 검증', () => {
    const lesson37 = MISSIONS.find((m) => m.id === 37);
    expect(lesson37).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['val1 = 0;', 'val2 = 0;', '// footer'],
      cursor: { line: 2, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson37!.checkComplete(stateNotDone)).toBe(false);
  });

  it('레슨 38: 아규먼트 리스트(Arglist: :args, :argdo, :n) 완료 조건 검증', () => {
    const lesson38 = MISSIONS.find((m) => m.id === 38);
    expect(lesson38).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['const API_HOST = "HTTP_V1";'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson38!.checkComplete(stateNotDone)).toBe(false);
  });

  it('레슨 39: 순정 파일 탐색기 Netrw(:Explore, :E) 완료 조건 검증', () => {
    const lesson39 = MISSIONS.find((m) => m.id === 39);
    expect(lesson39).toBeDefined();
    expect(lesson39?.par).toBe(7);

    const stateNotDone: VimEditorState = {
      lines: ['console.log("Welcome to Netrw lesson");'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'index.ts',
    };
    expect(lesson39!.checkComplete(stateNotDone)).toBe(false);
  });

  it('레슨 40: .vimrc 환경설정 버퍼 편집(:e ~/.vimrc) 및 실시간 소싱(:source, :so %) 완료 조건 검증', () => {
    const lesson40 = MISSIONS.find((m) => m.id === 40);
    expect(lesson40).toBeDefined();
    expect(lesson40?.par).toBe(19);

    const stateNotDone: VimEditorState = {
      lines: ['export function main() {}'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'app.ts',
    };
    expect(lesson40!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['export function main() {}'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'app.ts',
      options: {
        number: true,
        relativenumber: true,
        ignorecase: true,
        smartcase: true,
        hlsearch: true,
        wrap: true,
        cursorline: true,
        tabstop: 2,
        shiftwidth: 2,
        expandtab: true,
        list: false,
        wildmenu: true,
        spell: false,
      },
      buffers: [
        {
          id: 1,
          name: 'app.ts',
          lines: ['export function main() {}'],
          cursor: { line: 0, col: 0 },
          undoStack: [],
          redoStack: [],
          isModified: false,
        },
        {
          id: 2,
          name: '~/.vimrc',
          lines: ['set relativenumber'],
          cursor: { line: 0, col: 0 },
          undoStack: [],
          redoStack: [],
          isModified: false,
        },
      ],
    };
    expect(lesson40!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 41: 순정 ctags 심볼 점프(Ctrl+])와 태그 스택 복귀(Ctrl+t) 완료 조건 검증', () => {
    const lesson41 = MISSIONS.find((m) => m.id === 41);
    expect(lesson41).toBeDefined();
    expect(lesson41?.par).toBe(6);

    const stateNotDone: VimEditorState = {
      lines: ['const sum = add(10, 20);'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'app.ts',
    };
    expect(lesson41!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['const sum = add(10, 20);'],
      cursor: { line: 0, col: 12 },
      mode: 'NORMAL',
      primaryFilename: 'app.ts',
      buffers: [
        {
          id: 1,
          name: 'app.ts',
          lines: ['const sum = add(10, 20);'],
          cursor: { line: 0, col: 12 },
        },
        {
          id: 2,
          name: 'src/utils.ts',
          lines: ['export function add() {}'],
          cursor: { line: 0, col: 0 },
        },
      ],
      tagStack: [],
    };
    expect(lesson41!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 42: 순정 diffsplit과 ]c, do로 코드 변경점 비교 및 버그 패치 병합 완료 조건 검증', () => {
    const lesson42 = MISSIONS.find((m) => m.id === 42);
    expect(lesson42).toBeDefined();
    expect(lesson42?.par).toBe(8);

    const stateNotDone: VimEditorState = {
      lines: ['function test() {', '  return 1;', '}'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson42!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        'function calculateCartTotal(cart: CartItem[]) {',
        '  let subtotal = 0;',
        '  for (const item of cart) {',
        '    subtotal += item.price * item.quantity; // [FIX] quantity applied',
        '  }',
        '  const discount = subtotal * 0.15; // [FIX] new 15% promo discount rate',
        '  return subtotal - discount;',
        '}',
      ],
      cursor: { line: 5, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson42!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 43: 순정 경로 완성(Ctrl+x Ctrl+f) 및 전체 라인 복제(Ctrl+x Ctrl+l) 완료 조건 검증', () => {
    const lesson43 = MISSIONS.find((m) => m.id === 43);
    expect(lesson43).toBeDefined();
    expect(lesson43?.par).toBe(15);

    const stateNotDone: VimEditorState = {
      lines: ['import { add } from "./src/'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson43!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        'import { add } from "./src/utils.ts";',
        'export const adminSettings = { theme: "dark", autoSave: true };',
        'export const adminSettings = { theme: "dark", autoSave: true };',
      ],
      cursor: { line: 2, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson43!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 44 (Undo Tree 시간 여행 및 과거 브랜치 복구) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson44 = MISSIONS.find((m) => m.id === 44);
    expect(lesson44).toBeDefined();
    expect(lesson44?.par).toBe(2);

    const incompleteState: VimEditorState = {
      lines: ['// TODO: implement tax calculation later'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson44!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [
        'export function calculateTax(amount: number): number {',
        '  return amount * 0.1;',
        '}',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson44!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 45 (대소문자 변환 gU, gu) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson45 = MISSIONS.find((m) => m.id === 45);
    expect(lesson45).toBeDefined();
    expect(lesson45?.par).toBe(8);

    const incompleteState: VimEditorState = {
      lines: [
        'export const maxRetryCount = 5;',
        'export const API_KEY_SECRET = "production_key";',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson45!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [
        'export const MAXRETRYCOUNT = 5;',
        'export const api_key_secret = "production_key";',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson45!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 46 (퀵픽스 로그 파일 로드 :cfile) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson46 = MISSIONS.find((m) => m.id === 46);
    expect(lesson46).toBeDefined();
    expect(lesson46?.par).toBe(26);

    const incompleteState: VimEditorState = {
      lines: [
        'export function calculateTotal(items: number[]): number {',
        '  const reslt = items.reduce((a, b) => a + b, 0);',
        '  return reslt;',
        '}',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson46!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [
        'export function calculateTotal(items: number[]): number {',
        '  const result = items.reduce((a, b) => a + b, 0);',
        '  return reslt;',
        '}',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson46!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 47 (순정 코드 폴딩 za, zo, zM, zR) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson47 = MISSIONS.find((m) => m.id === 47);
    expect(lesson47).toBeDefined();
    expect(lesson47?.par).toBe(13);

    const incompleteState: VimEditorState = {
      lines: [...lesson47!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson47!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson47!.targetLines!],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      folds: [
        { startRow: 1, endRow: 3, closed: true },
        { startRow: 6, endRow: 8, closed: true },
        { startRow: 11, endRow: 13, closed: true },
      ],
    };
    expect(lesson47!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 48 (대화형 치환 :%s/old/new/gc) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson48 = MISSIONS.find((m) => m.id === 48);
    expect(lesson48).toBeDefined();
    expect(lesson48?.par).toBe(23);

    const incompleteState: VimEditorState = {
      lines: [...lesson48!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson48!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson48!.targetLines!],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      confirmSubstitute: null,
    };
    expect(lesson48!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 49 (로케이션 리스트 :lvimgrep, :lne) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson49 = MISSIONS.find((m) => m.id === 49);
    expect(lesson49).toBeDefined();
    expect(lesson49?.par).toBe(33);

    const incompleteState: VimEditorState = {
      lines: [...lesson49!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson49!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson49!.targetLines!],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson49!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 50 (전역 마크 mA, \'A로 버퍼 간 순간이동) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson50 = MISSIONS.find((m) => m.id === 50);
    expect(lesson50).toBeDefined();
    expect(lesson50?.par).toBe(17);

    const incompleteState: VimEditorState = {
      lines: [...lesson50!.initialLines],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson50!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson50!.targetLines!],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'server.ts',
      secondaryFilename: 'config.ts',
      currentBufferId: 1,
      buffers: [
        {
          id: 1,
          name: 'server.ts',
          lines: [...lesson50!.targetLines!],
          cursor: { line: 1, col: 0 },
        },
        {
          id: 2,
          name: 'config.ts',
          lines: ['PORT = 8080;', 'HOST = "localhost";'],
          cursor: { line: 0, col: 0 },
        },
      ],
    };
    expect(lesson50!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 51 (커스텀 키매핑 :nmap, :nnoremap) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson51 = MISSIONS.find((m) => m.id === 51);
    expect(lesson51).toBeDefined();
    expect(lesson51?.par).toBe(14);

    const incompleteState: VimEditorState = {
      lines: [...lesson51!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson51!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson51!.targetLines!],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
      userKeymaps: { 'n:Y': 'y$' },
    };
    expect(lesson51!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 52 (vim-surround: cs, ds, ysiw) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson52 = MISSIONS.find((m) => m.id === 52);
    expect(lesson52).toBeDefined();
    expect(lesson52?.par).toBe(15);

    const incompleteState: VimEditorState = {
      lines: [...lesson52!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson52!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson52!.targetLines!],
      cursor: { line: 2, col: 13 },
      mode: 'NORMAL',
    };
    expect(lesson52!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 53 (매크로 반복 실행: @a, [count]@@) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson53 = MISSIONS.find((m) => m.id === 53);
    expect(lesson53).toBeDefined();
    expect(lesson53?.par).toBe(17);

    const incompleteState: VimEditorState = {
      lines: [...lesson53!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson53!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson53!.targetLines!],
      cursor: { line: 4, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson53!.checkComplete(completeState)).toBe(true);
    expect(lesson53!.checkComplete({ ...completeState, mode: 'INSERT' })).toBe(false);
  });

  it('레슨 54 (인덴트 텍스트 객체: dai, cii) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson54 = MISSIONS.find((m) => m.id === 54);
    expect(lesson54).toBeDefined();
    expect(lesson54?.par).toBe(22);

    const incompleteState: VimEditorState = {
      lines: [...lesson54!.initialLines],
      cursor: { line: 4, col: 4 },
      mode: 'NORMAL',
    };
    expect(lesson54!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson54!.targetLines!],
      cursor: { line: 4, col: 15 },
      mode: 'NORMAL',
    };
    expect(lesson54!.checkComplete(completeState)).toBe(true);
    expect(lesson54!.checkComplete({ ...completeState, mode: 'INSERT' })).toBe(false);
  });

  it('레슨 55 (사용자 정의 Ex 명령: :command!) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson55 = MISSIONS.find((m) => m.id === 55);
    expect(lesson55).toBeDefined();
    expect(lesson55?.par).toBe(39);

    const incompleteState: VimEditorState = {
      lines: [...lesson55!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson55!.checkComplete(incompleteState)).toBe(false);

    // 명령을 등록하지 않고 직접 :g 로 지운 경우는 미완료
    const withoutCommand: VimEditorState = {
      lines: [...lesson55!.targetLines!],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson55!.checkComplete(withoutCommand)).toBe(false);

    const completeState: VimEditorState = {
      ...withoutCommand,
      userCommands: { D: { name: 'D', nargs: '1', range: 'none', bang: false, replacement: 'g/<args>/d' } },
    };
    expect(lesson55!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 56 (Vim script 함수: :function, :%call) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson56 = MISSIONS.find((m) => m.id === 56);
    expect(lesson56).toBeDefined();
    expect(lesson56?.par).toBe(46);

    const incompleteState: VimEditorState = {
      lines: [...lesson56!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson56!.checkComplete(incompleteState)).toBe(false);

    // 함수 없이 직접 편집한 경우는 미완료
    const withoutFunction: VimEditorState = {
      lines: [...lesson56!.targetLines!],
      cursor: { line: 2, col: 2 },
      mode: 'NORMAL',
    };
    expect(lesson56!.checkComplete(withoutFunction)).toBe(false);

    const completeState: VimEditorState = {
      ...withoutFunction,
      userFunctions: {
        Cmt: { name: 'Cmt', params: [], varargs: false, range: false, abort: false, body: ['exe "norm! I// "'] },
      },
    };
    expect(lesson56!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 57 (Vim script 리스트: getline, map, printf, setline) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson57 = MISSIONS.find((m) => m.id === 57);
    expect(lesson57).toBeDefined();
    expect(lesson57?.par).toBe(77);

    const incompleteState: VimEditorState = {
      lines: [...lesson57!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson57!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson57!.targetLines!],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson57!.checkComplete(completeState)).toBe(true);
    expect(lesson57!.checkComplete({ ...completeState, mode: 'COMMAND' })).toBe(false);
  });

  it('레슨 58 (문단·문장 텍스트 객체: dap, P, das) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson58 = MISSIONS.find((m) => m.id === 58);
    expect(lesson58).toBeDefined();
    expect(lesson58?.par).toBe(13);

    const incompleteState: VimEditorState = {
      lines: [...lesson58!.initialLines],
      cursor: { line: 4, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson58!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson58!.targetLines!],
      cursor: { line: 4, col: 17 },
      mode: 'NORMAL',
    };
    expect(lesson58!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 59 (Vim 정규식 \\zs 와 \\= 계산식 치환) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson59 = MISSIONS.find((m) => m.id === 59);
    expect(lesson59).toBeDefined();
    expect(lesson59?.par).toBe(33);

    const incompleteState: VimEditorState = {
      lines: [...lesson59!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson59!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson59!.targetLines!],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson59!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 60 (보조 모션: d]), g_, +, d)) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson60 = MISSIONS.find((m) => m.id === 60);
    expect(lesson60).toBeDefined();
    expect(lesson60?.par).toBe(10);

    const incompleteState: VimEditorState = {
      lines: [...lesson60!.initialLines],
      cursor: { line: 0, col: 10 },
      mode: 'NORMAL',
    };
    expect(lesson60!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson60!.targetLines!],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson60!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 61 (맞춤법 검사기: :set spell, ]s, z=, zg) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson61 = MISSIONS.find((m) => m.id === 61);
    expect(lesson61).toBeDefined();
    expect(lesson61?.par).toBe(25);

    const incompleteState: VimEditorState = {
      lines: [...lesson61!.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson61!.checkComplete(incompleteState)).toBe(false);

    const completeState: VimEditorState = {
      lines: [...lesson61!.targetLines!],
      cursor: { line: 2, col: 9 },
      mode: 'NORMAL',
      options: {
        number: true,
        relativenumber: false,
        ignorecase: false,
        smartcase: false,
        hlsearch: true,
        wrap: false,
        cursorline: false,
        tabstop: 2,
        shiftwidth: 2,
        expandtab: true,
        list: false,
        wildmenu: true,
        spell: true,
      },
      spellGoodWords: ['redux'],
    };
    expect(lesson61!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 62: 고급 Vim script 람다와 sort() 로 길이순 정렬하기 checkComplete 판정 검증', () => {
    const lesson62 = MISSIONS.find((m) => m.id === 62);
    expect(lesson62).toBeDefined();

    const completeState: VimEditorState = {
      lines: ['fig', 'kiwi', 'banana', 'watermelon'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson62!.checkComplete(completeState)).toBe(true);

    const incompleteState: VimEditorState = {
      lines: ['watermelon', 'fig', 'banana', 'kiwi'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson62!.checkComplete(incompleteState)).toBe(false);
  });

  it('레슨 63: 커맨드라인 파이프 | 및 한 줄 제어문 checkComplete 판정 검증', () => {
    const lesson63 = MISSIONS.find((m) => m.id === 63);
    expect(lesson63).toBeDefined();

    const completeState: VimEditorState = {
      lines: ['1. DEPLOY', '2. BUILD', '3. TEST'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson63!.checkComplete(completeState)).toBe(true);

    const incompleteState: VimEditorState = {
      lines: ['task_deploy', 'task_build', 'task_test'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson63!.checkComplete(incompleteState)).toBe(false);
  });

  it('레슨 64: Netrw 프로젝트 탐색기 & 디렉터리/파일 제어 checkComplete 판정 검증', () => {
    const lesson64 = MISSIONS.find((m) => m.id === 64);
    expect(lesson64).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson64!.initialLines],
      cursor: { ...lesson64!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson64!.primaryFilename,
    };

    for (const key of lesson64!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson64!.checkComplete(state)).toBe(true);
  });

  it('레슨 65: 글로벌 프로젝트 리팩토링과 :vimgrep, :cdo / :cfdo 대규모 검색 치환 checkComplete 판정 검증', () => {
    const lesson65 = MISSIONS.find((m) => m.id === 65);
    expect(lesson65).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson65!.initialLines],
      cursor: { ...lesson65!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson65!.primaryFilename,
      secondaryFilename: lesson65!.secondaryFilename,
      secondaryLines: lesson65!.secondaryLines,
    };
    expect(lesson65!.checkComplete(state)).toBe(false);

    for (const key of lesson65!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson65!.checkComplete(state)).toBe(true);
  });

  it('레슨 66: 고급 매크로 레지스터 조작과 "ap / "ay 실전 편집 checkComplete 판정 검증', () => {
    const lesson66 = MISSIONS.find((m) => m.id === 66);
    expect(lesson66).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson66!.initialLines],
      cursor: { ...lesson66!.initialCursor },
      mode: 'NORMAL',
      registers: lesson66!.initialRegisters ? { ...lesson66!.initialRegisters } : undefined,
    };
    expect(lesson66!.checkComplete(state)).toBe(false);

    for (const key of lesson66!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson66!.checkComplete(state)).toBe(true);
  });

  it('레슨 67: Vim 세션 관리(:mksession, :source)로 분할 창과 버퍼 환경 영구 보존 checkComplete 판정 검증', () => {
    const lesson67 = MISSIONS.find((m) => m.id === 67);
    expect(lesson67).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson67!.initialLines],
      cursor: { ...lesson67!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson67!.primaryFilename,
      secondaryFilename: lesson67!.secondaryFilename,
      secondaryLines: lesson67!.secondaryLines,
    };
    expect(lesson67!.checkComplete(state)).toBe(false);

    for (const key of lesson67!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson67!.checkComplete(state)).toBe(true);
  });

  it('레슨 68: 점프 리스트(Ctrl-o / Ctrl-i)와 마크 정리(:delmarks!) checkComplete 판정 검증', () => {
    const lesson68 = MISSIONS.find((m) => m.id === 68);
    expect(lesson68).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson68!.initialLines],
      cursor: { ...lesson68!.initialCursor },
      mode: 'NORMAL',
    };
    expect(lesson68!.checkComplete(state)).toBe(false);

    for (const key of lesson68!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson68!.checkComplete(state)).toBe(true);
  });

  it('레슨 69: 버퍼 로컬 옵션(:setlocal)과 파일타입 들여쓰기(ftplugin) checkComplete 판정 검증', () => {
    const lesson69 = MISSIONS.find((m) => m.id === 69);
    expect(lesson69).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson69!.initialLines],
      cursor: { ...lesson69!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson69!.primaryFilename,
      secondaryFilename: lesson69!.secondaryFilename,
      secondaryLines: lesson69!.secondaryLines,
    };
    expect(lesson69!.checkComplete(state)).toBe(false);

    for (const key of lesson69!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson69!.checkComplete(state)).toBe(true);
  });

  it('레슨 70: 입력 모드 고속 탈출(:imap jk <Esc>)과 리더키(<leader>) checkComplete 판정 검증', () => {
    const lesson70 = MISSIONS.find((m) => m.id === 70);
    expect(lesson70).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson70!.initialLines],
      cursor: { ...lesson70!.initialCursor },
      mode: 'NORMAL',
    };
    expect(lesson70!.checkComplete(state)).toBe(false);

    for (const key of lesson70!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson70!.checkComplete(state)).toBe(true);
  });

  it('레슨 71: 순정 ctags 멀티 정의 심볼 탐색과 태그 선택기(:tselect, :tjump, g]) 마스터 검증', () => {
    const lesson71 = MISSIONS.find((m) => m.id === 71);
    expect(lesson71).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson71!.initialLines],
      cursor: { ...lesson71!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson71!.primaryFilename,
      secondaryFilename: lesson71!.secondaryFilename,
      secondaryLines: lesson71!.secondaryLines,
    };
    expect(lesson71!.checkComplete(state)).toBe(false);

    for (const key of lesson71!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson71!.checkComplete(state)).toBe(true);
  });

  it('레슨 72: 순정 Vim 자동 명령(Autocommand)과 저장 시 공백 자동 정리 마스터 검증', () => {
    const lesson72 = MISSIONS.find((m) => m.id === 72);
    expect(lesson72).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson72!.initialLines],
      cursor: { ...lesson72!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson72!.primaryFilename,
    };
    expect(lesson72!.checkComplete(state)).toBe(false);

    for (const key of lesson72!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson72!.checkComplete(state)).toBe(true);
  });

  it('레슨 73: 순정 Netrw 디렉터리 북마크(mb, gb)와 프로젝트 고속 탐색 마스터 검증', () => {
    const lesson73 = MISSIONS.find((m) => m.id === 73);
    expect(lesson73).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson73!.initialLines],
      cursor: { ...lesson73!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson73!.primaryFilename,
      virtualFiles: lesson73!.initialVirtualFiles ? { ...lesson73!.initialVirtualFiles } : undefined,
    };
    expect(lesson73!.checkComplete(state)).toBe(false);

    for (const key of lesson73!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson73!.checkComplete(state)).toBe(true);
  });

  it('레슨 74: 순정 퍼지 파인더(:find, :Files)와 프로젝트 파일 고속 분할 탐색 마스터 검증', () => {
    const lesson74 = MISSIONS.find((m) => m.id === 74);
    expect(lesson74).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson74!.initialLines],
      cursor: { ...lesson74!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson74!.primaryFilename,
      virtualFiles: lesson74!.initialVirtualFiles ? { ...lesson74!.initialVirtualFiles } : undefined,
    };
    expect(lesson74!.checkComplete(state)).toBe(false);

    for (const key of lesson74!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson74!.checkComplete(state)).toBe(true);
  });

  it('레슨 75: 순정 Vim 내장 도움말(:help, K)과 태그 링크 점프 마스터 검증', () => {
    const lesson75 = MISSIONS.find((m) => m.id === 75);
    expect(lesson75).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson75!.initialLines],
      cursor: { ...lesson75!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson75!.primaryFilename,
    };
    expect(lesson75!.checkComplete(state)).toBe(false);

    for (const key of lesson75!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson75!.checkComplete(state)).toBe(true);
  });

  it('레슨 76: 순정 주석 토글(gcc, gc{motion})과 언어별 commentstring 마스터 검증', () => {
    const lesson76 = MISSIONS.find((m) => m.id === 76);
    expect(lesson76).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson76!.initialLines],
      cursor: { ...lesson76!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson76!.primaryFilename,
    };
    expect(lesson76!.checkComplete(state)).toBe(false);

    for (const key of lesson76!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson76!.checkComplete(state)).toBe(true);
  });

  it('레슨 77: 커서 아래 파일 점프(gf, gF)와 프로젝트 탐색 마스터 검증', () => {
    const lesson77 = MISSIONS.find((m) => m.id === 77);
    expect(lesson77).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson77!.initialLines],
      cursor: { ...lesson77!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson77!.primaryFilename,
      virtualFiles: lesson77!.initialVirtualFiles ? { ...lesson77!.initialVirtualFiles } : undefined,
    };
    expect(lesson77!.checkComplete(state)).toBe(false);

    for (const key of lesson77!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson77!.checkComplete(state)).toBe(true);
  });

  it('레슨 78: 들여쓰기 기반 폴딩(:set fdm=indent)과 수동 폴드(zf) 마스터 검증', () => {
    const lesson78 = MISSIONS.find((m) => m.id === 78);
    expect(lesson78).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson78!.initialLines],
      cursor: { ...lesson78!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson78!.primaryFilename,
    };
    expect(lesson78!.checkComplete(state)).toBe(false);

    for (const key of lesson78!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson78!.checkComplete(state)).toBe(true);
  });

  it('레슨 79: 표현식 레지스터("=)와 시스템 클립보드("+) 완전 마스터 검증', () => {
    const lesson79 = MISSIONS.find((m) => m.id === 79);
    expect(lesson79).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson79!.initialLines],
      cursor: { ...lesson79!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson79!.primaryFilename,
    };
    expect(lesson79!.checkComplete(state)).toBe(false);

    for (const key of lesson79!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson79!.checkComplete(state)).toBe(true);
  });

  it('레슨 80: 텍스트 포매팅(gq, :set textwidth)과 탭 정리(:retab) 마스터 검증', () => {
    const lesson80 = MISSIONS.find((m) => m.id === 80);
    expect(lesson80).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson80!.initialLines],
      cursor: { ...lesson80!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson80!.primaryFilename,
    };
    expect(lesson80!.checkComplete(state)).toBe(false);

    for (const key of lesson80!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson80!.checkComplete(state)).toBe(true);
  });

  it('레슨 81: 뷰포트 스크롤(:set scrolloff)과 정밀 붙여넣기(]p, gp) 마스터 검증', () => {
    const lesson81 = MISSIONS.find((m) => m.id === 81);
    expect(lesson81).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson81!.initialLines],
      cursor: { ...lesson81!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson81!.primaryFilename,
    };
    expect(lesson81!.checkComplete(state)).toBe(false);

    for (const key of lesson81!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson81!.checkComplete(state)).toBe(true);
  });

  it('레슨 82: 자동 약어 확장(:iabbrev, :cabbrev, Ctrl-])과 오타 자동 교정 마스터 검증', () => {
    const lesson82 = MISSIONS.find((m) => m.id === 82);
    expect(lesson82).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson82!.initialLines],
      cursor: { ...lesson82!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson82!.primaryFilename,
    };
    expect(lesson82!.checkComplete(state)).toBe(false);

    for (const key of lesson82!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson82!.checkComplete(state)).toBe(true);
  });

  it('레슨 83: Visual 고급 편집(o / O, g Ctrl-g, gJ)과 비주얼 블록(Ctrl-v $ A / c) 마스터 검증', () => {
    const lesson83 = MISSIONS.find((m) => m.id === 83);
    expect(lesson83).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson83!.initialLines],
      cursor: { ...lesson83!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson83!.primaryFilename,
    };
    expect(lesson83!.checkComplete(state)).toBe(false);

    for (const key of lesson83!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson83!.checkComplete(state)).toBe(true);
  });

  it('레슨 84: 고급 Ex 정렬(:sort /pat/ f ! i)과 파일 삽입(:read), 줄 이동·복제(:move/:copy) 마스터 검증', () => {
    const lesson84 = MISSIONS.find((m) => m.id === 84);
    expect(lesson84).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson84!.initialLines],
      cursor: { ...lesson84!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson84!.primaryFilename,
      virtualFiles: lesson84!.initialVirtualFiles ? { ...lesson84!.initialVirtualFiles } : undefined,
    };
    expect(lesson84!.checkComplete(state)).toBe(false);

    for (const key of lesson84!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson84!.checkComplete(state)).toBe(true);
  });

  it('레슨 85: 가상 셸 파이프·필터링(:0r !, !!, !G sort | uniq, :w !wc -l) 마스터 검증', () => {
    const lesson85 = MISSIONS.find((m) => m.id === 85);
    expect(lesson85).toBeDefined();

    let state: VimEditorState = {
      lines: [...lesson85!.initialLines],
      cursor: { ...lesson85!.initialCursor },
      mode: 'NORMAL',
      primaryFilename: lesson85!.primaryFilename,
    };
    expect(lesson85!.checkComplete(state)).toBe(false);

    for (const key of lesson85!.optimalKeys!) {
      state = handleKey(state, key);
    }
    expect(lesson85!.checkComplete(state)).toBe(true);
  });

  it('모든 85개 레슨이 3성(Par) 기준 optimalKeys를 포함하며 이를 실행하면 미션이 완료된다', () => {
    expect(MISSIONS.length).toBe(85);

    MISSIONS.forEach((m) => {
      expect(m.optimalKeys, `레슨 ${m.id}에 optimalKeys가 정의되어 있어야 합니다.`).toBeDefined();
      expect(m.optimalKeys!.length).toBeGreaterThan(0);
      expect(m.optimalKeys!.length).toBeLessThanOrEqual(m.par);

      let splitPanes: [SplitPaneState, SplitPaneState] | undefined = undefined;
      if (m.initialSplit && m.initialSplit !== 'none') {
        splitPanes = [
          {
            filename: m.primaryFilename || 'source.ts',
            lines: [...m.initialLines],
            cursor: { ...m.initialCursor },
            mode: 'NORMAL',
            diff: m.initialDiffMode ?? false,
          },
          {
            filename: m.secondaryFilename || 'target.ts',
            lines: m.secondaryLines ? [...m.secondaryLines] : [...m.initialLines],
            cursor: { line: 0, col: 0 },
            mode: 'NORMAL',
            diff: m.initialDiffMode ?? false,
          },
        ];
      }

      let state: VimEditorState = {
        lines: [...m.initialLines],
        cursor: { ...m.initialCursor },
        mode: 'NORMAL',
        undoStack: m.initialUndoStack ? [...m.initialUndoStack] : [],
        redoStack: [],
        undoTreeNodes: m.initialUndoTreeNodes,
        currentUndoSeq: m.initialCurrentUndoSeq,
        maxUndoSeq: m.initialMaxUndoSeq,
        undoTimeHistory: m.initialUndoTimeHistory,
        undoTimeIndex: m.initialUndoTimeIndex,
        clipboard: m.initialClipboard,
        primaryFilename: m.primaryFilename,
        secondaryFilename: m.secondaryFilename,
        secondaryLines: m.secondaryLines,
        splitDirection: m.initialSplit ?? 'none',
        splitPanes,
        diffMode: m.initialDiffMode ?? false,
        diffHunks: m.initialDiffMode && splitPanes ? computeDiffHunks(splitPanes[0].lines, splitPanes[1].lines) : undefined,
        commandHistory: m.initialCommandHistory ? [...m.initialCommandHistory] : undefined,
        searchHistory: m.initialSearchHistory ? [...m.initialSearchHistory] : undefined,
        quickfix: m.initialQuickfixItems
          ? { items: [...m.initialQuickfixItems], currentIndex: 0, isOpen: false }
          : undefined,
        locationList: m.initialLocationListItems
          ? { items: [...m.initialLocationListItems], currentIndex: 0, isOpen: false }
          : undefined,
        changeList: m.initialChangeList ? [...m.initialChangeList] : undefined,
        changeIndex: m.initialChangeList ? m.initialChangeList.length : undefined,
        argList: m.initialArgs
          ? { files: [...m.initialArgs], currentIndex: 0 }
          : undefined,
        folds: m.initialFolds ? [...m.initialFolds] : undefined,
        registers: m.initialRegisters ? { ...m.initialRegisters } : undefined,
        virtualFiles: m.initialVirtualFiles ? { ...m.initialVirtualFiles } : undefined,
      };

      for (const key of m.optimalKeys!) {
        state = handleKey(state, key);
      }

      expect(m.checkComplete(state), `레슨 ${m.id} (${m.title}) optimalKeys 실행 후 미션이 통과되어야 합니다.`).toBe(true);
    });
  });
});


