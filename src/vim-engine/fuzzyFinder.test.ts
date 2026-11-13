import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  fuzzyMatch,
  searchFilesFuzzy,
  openFuzzyFinder,
  closeFuzzyFinder,
  updateFuzzyFinderQuery,
  moveFuzzyFinderSelection,
  selectFuzzyFinderItem,
} from './index';
import { executeCommandLine } from './commandLine';

function execEx(state: any, cmd: string) {
  return executeCommandLine(state, cmd, (s, k) => handleKey(s, k));
}

describe('Vim Pure Fuzzy Finder Engine (:find, :Files, :Buffers, fuzzyMatch)', () => {
  it('fuzzyMatch 가 대소문자 무시 및 단어 경계 가중치를 반영하여 매칭한다', () => {
    // 1. 단순 일치
    const res1 = fuzzyMatch('auth', 'services/auth.ts');
    expect(res1.matches).toBe(true);
    expect(res1.score).toBeGreaterThan(0);
    expect(res1.indices.length).toBe(4);

    // 2. 단어 경계/약어 일치 (h -> Header)
    const res2 = fuzzyMatch('hdr', 'components/Header.tsx');
    expect(res2.matches).toBe(true);

    // 3. 불일치
    const res3 = fuzzyMatch('xyz', 'services/auth.ts');
    expect(res3.matches).toBe(false);

    // 4. 빈 쿼리는 전체 매칭
    const res4 = fuzzyMatch('', 'any.ts');
    expect(res4.matches).toBe(true);
  });

  it('searchFilesFuzzy 가 점수 높은 순서로 파일 목록을 반환한다', () => {
    const vfs = {
      'src/components/Header.tsx': [''],
      'src/auth/service.ts': [''],
      'src/utils/math.ts': [''],
      'docs/auth_guide.md': [''],
    };

    const results = searchFilesFuzzy(vfs, 'auth');
    expect(results.length).toBe(2);
    // 더 짧고 파일명에 auth가 들어간 'src/auth/service.ts' 또는 'docs/auth_guide.md'
    expect(results.map((r) => r.path)).toContain('src/auth/service.ts');
    expect(results.map((r) => r.path)).toContain('docs/auth_guide.md');
  });

  it(':find {filename} 명령으로 가상 파일시스템의 파일을 즉시 검색하여 연다', () => {
    let state = createVimState(['// main buffer']);
    state = {
      ...state,
      primaryFilename: 'app.ts',
      virtualFiles: {
        'services/auth.ts': ['export const verify = () => true;'],
        'utils/format.ts': ['export const fmt = () => "";'],
      },
    };

    // 1. :find auth.ts 실행
    state = execEx(state, 'find auth.ts');
    expect(state.primaryFilename).toBe('services/auth.ts');
    expect(state.lines).toEqual(['export const verify = () => true;']);

    // 2. 존재하지 않는 파일 검색 시 E345 발생
    state = execEx(state, 'find nonexistent.ts');
    expect(state.bell).toBe(true);
    expect(state.commandMessage).toContain('E345: 찾을 수 없습니다: nonexistent.ts');
  });

  it(':Files 및 :Buffers 명령으로 퍼지 파인더 팝업을 연다', () => {
    let state = createVimState(['const a = 1;']);
    state = execEx(state, 'Files');
    expect(state.fuzzyFinder?.isOpen).toBe(true);
    expect(state.fuzzyFinder?.mode).toBe('files');

    state = execEx(state, 'Buffers');
    expect(state.fuzzyFinder?.isOpen).toBe(true);
    expect(state.fuzzyFinder?.mode).toBe('buffers');
  });

  it('퍼지 파인더 상태 조작(query, selection, open, vsplit, close)이 정상 동작한다', () => {
    let state = createVimState(['// app.ts']);
    state = {
      ...state,
      virtualFiles: {
        'src/components/Button.tsx': ['export const Button = () => null;'],
        'src/components/Header.tsx': ['export const Header = () => null;'],
      },
    };

    // 1. 열기
    state = openFuzzyFinder(state, 'files');
    expect(state.fuzzyFinder?.isOpen).toBe(true);

    // 2. 검색어 입력
    state = updateFuzzyFinderQuery(state, 'Head');
    expect(state.fuzzyFinder?.query).toBe('Head');

    // 3. 선택 항목 이동
    state = moveFuzzyFinderSelection(state, 1);
    expect(state.fuzzyFinder?.selectedIndex).toBe(0); // 1개 매칭이므로 0 유지

    // 4. vsplit 분할 창으로 열기
    state = selectFuzzyFinderItem(state, 'vsplit');
    expect(state.fuzzyFinder).toBeNull();
    expect(state.splitDirection).toBe('vertical');
    expect(state.secondaryFilename).toBe('src/components/Header.tsx');

    // 5. 일반 open 으로 열기 검증
    state = openFuzzyFinder(state, 'files');
    state = updateFuzzyFinderQuery(state, 'Button');
    state = selectFuzzyFinderItem(state, 'open');
    expect(state.fuzzyFinder).toBeNull();
    expect(state.primaryFilename).toBe('src/components/Button.tsx');

    // 6. 닫기 (Esc)
    state = openFuzzyFinder(state, 'files');
    state = closeFuzzyFinder(state);
    expect(state.fuzzyFinder).toBeNull();
  });

  it('handleKey 로 키 입력을 전달하여 대화형으로 검색 및 선택할 수 있다', () => {
    let state = createVimState(['// main']);
    state = {
      ...state,
      virtualFiles: {
        'src/utils/math.ts': ['export const add = (a, b) => a + b;'],
        'src/utils/string.ts': ['export const trim = (s) => s.trim();'],
      },
    };

    // 1. :Files 커맨드로 퍼지 파인더 열기
    state = execEx(state, 'Files');
    expect(state.fuzzyFinder?.isOpen).toBe(true);

    // 2. 'm', 'a', 't', 'h' 타이핑
    for (const ch of 'math') {
      state = handleKey(state, ch);
    }
    expect(state.fuzzyFinder?.query).toBe('math');

    // 3. Enter 키로 선택 열기
    state = handleKey(state, '<CR>');
    expect(state.fuzzyFinder).toBeNull();
    expect(state.primaryFilename).toBe('src/utils/math.ts');
    expect(state.lines).toEqual(['export const add = (a, b) => a + b;']);
  });
});
