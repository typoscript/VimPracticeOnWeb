import { describe, it, expect, afterEach } from 'vitest';
import {
  createVimState,
  handleKey,
  executeCommandLine,
  configureVimEngine,
} from './index';

function typeKeys(state: ReturnType<typeof createVimState>, keys: string[]) {
  let s = state;
  for (const k of keys) {
    s = handleKey(s, k);
  }
  return s;
}

afterEach(() => {
  configureVimEngine({ locale: 'ko' });
});

describe('flash.nvim 화면 라벨 점프 엔진 (gs, dgs/cgs/ygs, Visual gs, :Flash)', () => {
  const sampleLines = [
    'const alpha = compute(1);',
    'const beta = compute(2);',
    'function render(value) {',
    '  return compute(value);',
    '}',
  ];

  it('gs 입력 후 검색 문자 타이핑 시 충돌 없는 홈로우 라벨을 부여하고 라벨 키로 즉시 점프한다', () => {
    let s = createVimState(sampleLines, { line: 0, col: 0 });
    s = typeKeys(s, ['g', 's']);
    expect(s.flashJump?.isOpen).toBe(true);

    // "co" 검색 -> line 0 col 0("const"), line 0 col 14("compute"), line 1 col 0("const"), line 1 col 13("compute"), line 3 col 9("compute")
    s = typeKeys(s, ['c', 'o']);
    expect(s.flashJump?.matches.length).toBe(5);
    // 다음 문자인 'n', 'm' 은 라벨로 쓰이지 않아야 함 (충돌 회피)
    const labels = s.flashJump!.matches.map((m) => m.label);
    expect(labels).not.toContain('n');
    expect(labels).not.toContain('m');

    // line 3 col 9 매치의 라벨을 눌러 즉시 점프
    const targetMatch = s.flashJump!.matches.find((m) => m.line === 3 && m.col === 9);
    expect(targetMatch).toBeDefined();

    s = handleKey(s, targetMatch!.label);
    expect(s.flashJump).toBeNull();
    expect(s.cursor).toEqual({ line: 3, col: 9 });

    // 점프 리스트(Ctrl-o)로 원래 위치 복귀 가능
    s = handleKey(s, 'Ctrl-o');
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });

  it('Enter 는 가장 가까운 첫 매치로 점프하고, Backspace 로 검색어를 수정하며 Esc 로 취소한다', () => {
    let s = createVimState(sampleLines, { line: 0, col: 0 });
    s = typeKeys(s, ['g', 's', 'r', 'e', 'n']);
    expect(s.flashJump?.matches).toHaveLength(1);
    expect(s.flashJump?.matches[0]).toMatchObject({ line: 2, col: 9 });

    // Backspace 로 "re" 로 되돌리면 render + return 2개 매치
    s = handleKey(s, 'Backspace');
    expect(s.flashJump?.query).toBe('re');
    expect(s.flashJump?.matches.length).toBe(2);

    // Enter 로 첫 매치(render) 점프
    s = handleKey(s, 'Enter');
    expect(s.flashJump).toBeNull();
    expect(s.cursor).toEqual({ line: 2, col: 9 });

    // 다시 열어서 Esc 로 취소
    s = typeKeys(s, ['g', 's', 'c', 'o', 'Escape']);
    expect(s.flashJump).toBeNull();
    expect(s.cursor).toEqual({ line: 2, col: 9 });
  });

  it('Visual 모드 v + gs 로 선택 영역을 Flash 라벨 위치까지 즉시 확장한다', () => {
    let s = createVimState(sampleLines, { line: 0, col: 6 });
    s = typeKeys(s, ['v', 'g', 's', 'r', 'e', 't']);
    expect(s.flashJump?.isOpen).toBe(true);
    expect(s.flashJump?.visualMode).toBe('VISUAL');
    expect(s.flashJump?.matches).toHaveLength(1);

    s = handleKey(s, 'Enter');
    expect(s.flashJump).toBeNull();
    expect(s.mode).toBe('VISUAL');
    expect(s.visualAnchor).toEqual({ line: 0, col: 6 });
    expect(s.cursor).toEqual({ line: 3, col: 2 });
  });

  it('연산자 대기 dgs / cgs / ygs 로 커서부터 타겟까지 삭제·변경·복사하고 u 로 되돌린다', () => {
    // dgs: "const alpha = compute(1);" 에서 col 6("alpha") -> "compute" 직전까지 삭제
    let s = createVimState(['const alpha = compute(1);'], { line: 0, col: 6 });
    s = typeKeys(s, ['d', 'g', 's', 'c', 'o', 'm']);
    expect(s.flashJump?.operator).toBe('d');
    s = handleKey(s, 'Enter');
    expect(s.mode).toBe('NORMAL');
    expect(s.lines[0]).toBe('const compute(1);');
    expect(s.clipboard?.content).toBe('alpha = ');

    // Undo 복원
    s = handleKey(s, 'u');
    expect(s.lines[0]).toBe('const alpha = compute(1);');

    // cgs: 변경 후 INSERT 모드 진입
    s = typeKeys(s, ['c', 'g', 's', 'c', 'o', 'm', 'Enter', 'v', 'a', 'l', ' ', '=', ' ', 'Escape']);
    expect(s.mode).toBe('NORMAL');
    expect(s.lines[0]).toBe('const val = compute(1);');

    // ygs: 복사 후 텍스트 보존
    let y = createVimState(['hello world target'], { line: 0, col: 0 });
    y = typeKeys(y, ['y', 'g', 's', 't', 'a', 'r', 'Enter']);
    expect(y.lines[0]).toBe('hello world target');
    expect(y.clipboard?.content).toBe('hello world ');
  });

  it(':Flash [query] Ex 명령 및 영어 로캘 메시지를 지원한다', () => {
    configureVimEngine({ locale: 'en' });
    let s = createVimState(['foo bar baz', 'bar qux'], { line: 0, col: 0 });
    s = executeCommandLine(s, ':Flash bar', handleKey);
    expect(s.flashJump?.isOpen).toBe(true);
    expect(s.flashJump?.matches).toHaveLength(2);
    expect(s.commandMessage).toContain('[Flash]');
    expect(s.commandMessage).toContain('matches');

    const secondMatch = s.flashJump!.matches.find((m) => m.line === 1);
    s = handleKey(s, secondMatch!.label);
    expect(s.cursor).toEqual({ line: 1, col: 0 });
    expect(s.commandMessage).toBe('[Flash] Jumped to line 2, col 1');
  });

  it('Flash 세션 중 u 문자를 검색어나 라벨로 입력해도 Undo 불변성 검사가 오탐하지 않는다', () => {
    let s = createVimState(['const sum = 1;', 'return sum;'], { line: 0, col: 0 });
    // undoStack 에 스냅샷이 있는 상태 만들기
    s = typeKeys(s, ['x', 'i', 'c', 'Escape']);
    expect((s.undoStack?.length ?? 0) > 0).toBe(true);

    // Flash 모드에서 'u' 를 검색 문자로 입력 -> 에러 없이 검색 수행
    s = typeKeys(s, ['g', 's', 's', 'u', 'm']);
    expect(s.flashJump?.matches.length).toBe(2);
    s = handleKey(s, 'Escape');
    expect(s.flashJump).toBeNull();
  });
});

describe('oil.nvim 버퍼 기반 파일시스템 편집기 (:Oil, o/dd/cw + :w, Enter, -, :q)', () => {
  const baseVfs: Record<string, string[]> = {
    'workspace/README.md': ['# Project'],
    'workspace/app/index.ts': ['export const app = true;'],
    'workspace/app/sub/math.ts': ['export const add = (a, b) => a + b;'],
  };

  it(':Oil 로 디렉터리 항목을 편집 가능한 버퍼로 열고 o 로 파일·폴더 생성 후 :w 로 VFS 에 반영한다', () => {
    let s = createVimState(['# Project'], { line: 0, col: 0 }, {
      primaryFilename: 'workspace/README.md',
      virtualFiles: { ...baseVfs },
    });

    s = executeCommandLine(s, ':Oil', handleKey);
    expect(s.oilSession?.isOpen).toBe(true);
    expect(s.primaryFilename).toBe('oil://workspace');
    expect(s.lines).toEqual(['/001 app/', '/002 README.md']);

    // 마지막 줄에서 o 로 새 파일과 새 폴더 추가
    s = typeKeys(s, ['G', 'o', 'n', 'e', 'w', '.', 't', 's', 'Enter', 'd', 'o', 'c', 's', '/', 'Escape']);
    s = executeCommandLine(s, ':w', handleKey);

    expect(s.virtualFiles?.['workspace/new.ts']).toEqual(['']);
    expect(s.virtualFiles?.['workspace/docs/.gitkeep']).toEqual(['']);
    expect(s.lines.some((l) => l.endsWith(' new.ts'))).toBe(true);
    expect(s.lines.some((l) => l.endsWith(' docs/'))).toBe(true);
  });

  it('Oil 버퍼에서 파일 이름 변경(cw)과 삭제(dd) 후 :w 실행 시 VFS 내용 보존 및 삭제를 수행한다', () => {
    let s = createVimState(['export const app = true;'], { line: 0, col: 0 }, {
      primaryFilename: 'workspace/app/index.ts',
      virtualFiles: { ...baseVfs },
    });

    // workspace/app 디렉터리로 자동 열림
    s = executeCommandLine(s, ':Oil', handleKey);
    expect(s.oilSession?.currentDir).toBe('workspace/app');
    expect(s.lines).toEqual(['/001 sub/', '/002 index.ts']);

    // /002 index.ts -> /002 entry.ts 로 이름 변경
    s = typeKeys(s, ['j', 'f', 'i', 'c', '$', 'e', 'n', 't', 'r', 'y', '.', 't', 's', 'Escape']);
    // /001 sub/ 삭제 (dd)
    s = typeKeys(s, ['k', 'd', 'd']);

    s = executeCommandLine(s, ':w', handleKey);
    expect(s.virtualFiles?.['workspace/app/entry.ts']).toEqual(['export const app = true;']);
    expect(s.virtualFiles?.['workspace/app/index.ts']).toBeUndefined();
    expect(s.virtualFiles?.['workspace/app/sub/math.ts']).toBeUndefined();
    expect(s.lines).toEqual(['/001 entry.ts']);
  });

  it('Oil 버퍼에서 Enter 로 하위 폴더 진입·파일 열기, - 로 상위 이동, :q 로 원 버퍼 복귀한다', () => {
    let s = createVimState(['# Project'], { line: 0, col: 0 }, {
      primaryFilename: 'workspace/README.md',
      virtualFiles: { ...baseVfs },
    });

    s = executeCommandLine(s, ':Oil', handleKey);
    expect(s.lines[0]).toBe('/001 app/');

    // Enter 로 workspace/app 진입
    s = handleKey(s, 'Enter');
    expect(s.oilSession?.currentDir).toBe('workspace/app');
    expect(s.lines).toEqual(['/001 sub/', '/002 index.ts']);

    // - 로 workspace 복귀
    s = handleKey(s, '-');
    expect(s.oilSession?.currentDir).toBe('workspace');

    // :q 로 Oil 닫고 원래 workspace/README.md 버퍼 복귀
    s = executeCommandLine(s, ':q', handleKey);
    expect(s.oilSession).toBeNull();
    expect(s.primaryFilename).toBe('workspace/README.md');
    expect(s.lines).toEqual(['# Project']);

    // 다시 :Oil workspace/app 후 index.ts 에서 Enter 로 파일 열기
    s = executeCommandLine(s, ':Oil workspace/app', handleKey);
    s = typeKeys(s, ['j', 'Enter']);
    expect(s.oilSession).toBeNull();
    expect(s.primaryFilename).toBe('workspace/app/index.ts');
    expect(s.lines).toEqual(['export const app = true;']);
  });

  it('영어 로캘에서 Oil 상태 메시지가 영어로 출력된다', () => {
    configureVimEngine({ locale: 'en' });
    let s = createVimState(['hello'], { line: 0, col: 0 }, {
      primaryFilename: 'workspace/a.txt',
      virtualFiles: { 'workspace/a.txt': ['hello'] },
    });
    s = executeCommandLine(s, ':Oil', handleKey);
    expect(s.commandMessage).toContain('[Oil] Opened');
    s = executeCommandLine(s, ':w', handleKey);
    expect(s.commandMessage).toBe('[Oil] No filesystem changes');
    s = executeCommandLine(s, ':q', handleKey);
    expect(s.commandMessage).toBe('[Oil] Closed file explorer buffer');
  });
});
