import { describe, it, expect } from 'vitest';
import { MISSIONS } from './missions';
import { VimEditorState } from '../types/vim';
import { handleKey } from '../engine/vimEngine';

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

  it('모든 34개 레슨이 3성(Par) 기준 optimalKeys를 포함하며 이를 실행하면 미션이 완료된다', () => {
    expect(MISSIONS.length).toBe(34);

    MISSIONS.forEach((m) => {
      expect(m.optimalKeys, `레슨 ${m.id}에 optimalKeys가 정의되어 있어야 합니다.`).toBeDefined();
      expect(m.optimalKeys!.length).toBeGreaterThan(0);
      expect(m.optimalKeys!.length).toBeLessThanOrEqual(m.par);

      let state: VimEditorState = {
        lines: [...m.initialLines],
        cursor: { ...m.initialCursor },
        mode: 'NORMAL',
        undoStack: m.initialUndoStack ? [...m.initialUndoStack] : [],
        redoStack: [],
        clipboard: m.initialClipboard,
        primaryFilename: m.primaryFilename,
        secondaryFilename: m.secondaryFilename,
        secondaryLines: m.secondaryLines,
      };

      for (const key of m.optimalKeys!) {
        state = handleKey(state, key);
      }

      expect(m.checkComplete(state), `레슨 ${m.id} (${m.title}) optimalKeys 실행 후 미션이 통과되어야 합니다.`).toBe(true);
    });
  });
});


