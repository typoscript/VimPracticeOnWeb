import { describe, it, expect } from 'vitest';
import {
  extractTagsFromLines,
  buildProjectTags,
  findTag,
  jumpToTag,
  popTagStack,
  formatTagStack,
} from './tagEngine';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

describe('tagEngine (ctags, Ctrl+], Ctrl+t, :tag, :pop, :tags)', () => {
  const createBaseState = (): VimEditorState => ({
    lines: [
      'import { add } from "./utils";',
      'const result = add(10, 20);',
      'function handleSum() {',
      '  return result;',
      '}',
    ],
    cursor: { line: 1, col: 16 }, // 'add' 단어 위 (col 15~17)
    mode: 'NORMAL',
    primaryFilename: 'app.ts',
    buffers: [
      {
        id: 1,
        name: 'app.ts',
        lines: [
          'import { add } from "./utils";',
          'const result = add(10, 20);',
          'function handleSum() {',
          '  return result;',
          '}',
        ],
        cursor: { line: 1, col: 16 },
      },
    ],
  });

  describe('extractTagsFromLines', () => {
    it('TypeScript/JavaScript 함수, 클래스, 상수 정의를 올바르게 추출한다', () => {
      const lines = [
        'export function calculateArea(width: number, height: number) {',
        '  return width * height;',
        '}',
        'export const MAX_SIZE = 1000;',
        'class GeometryService {',
        '}',
        'interface ShapeConfig {',
        '}',
      ];

      const tags = extractTagsFromLines('calc.ts', lines);
      expect(tags).toHaveLength(4);

      expect(tags[0]).toEqual({
        name: 'calculateArea',
        filename: 'calc.ts',
        line: 0,
        col: 16,
      });

      expect(tags[1]).toEqual({
        name: 'MAX_SIZE',
        filename: 'calc.ts',
        line: 3,
        col: 13,
      });

      expect(tags[2]).toEqual({
        name: 'GeometryService',
        filename: 'calc.ts',
        line: 4,
        col: 6,
      });

      expect(tags[3]).toEqual({
        name: 'ShapeConfig',
        filename: 'calc.ts',
        line: 6,
        col: 10,
      });
    });
  });

  describe('buildProjectTags & findTag', () => {
    it('기본 VFS 파일(src/utils.ts, src/main.ts) 및 현재 버퍼에서 태그를 종합 수집한다', () => {
      const state = createBaseState();
      const tags = buildProjectTags(state);

      // VFS의 add 함수
      const addTag = tags.find((t) => t.name === 'add');
      expect(addTag).toBeDefined();
      expect(addTag?.filename).toBe('src/utils.ts');

      // VFS의 APP_NAME 상수
      const appNameTag = tags.find((t) => t.name === 'APP_NAME');
      expect(appNameTag).toBeDefined();
      expect(appNameTag?.filename).toBe('src/main.ts');

      // app.ts의 handleSum 함수
      const handleSumTag = tags.find((t) => t.name === 'handleSum');
      expect(handleSumTag).toBeDefined();
      expect(handleSumTag?.filename).toBe('app.ts');
    });

    it('findTag로 대상을 정확히 검색한다', () => {
      const state = createBaseState();
      const found = findTag(state, 'add');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('add');
      expect(found?.filename).toBe('src/utils.ts');
    });
  });

  describe('jumpToTag & popTagStack', () => {
    it('다른 파일(src/utils.ts)의 add 함수로 점프 시 버퍼가 전환되고 커서 위치가 기록된다', () => {
      const state = createBaseState();
      const next = jumpToTag(state, 'add');

      expect(next.primaryFilename).toBe('src/utils.ts');
      expect(next.cursor.line).toBe(0); // export function add(...)
      expect(next.tagStack).toHaveLength(1);
      expect(next.tagStack![0]).toEqual({
        tag: 'add',
        filename: 'app.ts',
        cursor: { line: 1, col: 16 },
      });
      expect(next.commandMessage).toContain('tag 1 of 1 "add"');
    });

    it('동일 파일 내 심볼 점프 시 현재 버퍼 유지된 채 커서만 이동한다', () => {
      const state = createBaseState();
      const next = jumpToTag(state, 'handleSum');

      expect(next.primaryFilename).toBe('app.ts');
      expect(next.cursor.line).toBe(2); // function handleSum()
      expect(next.tagStack).toHaveLength(1);
    });

    it('존재하지 않는 태그 점프 시 E426 오류 메시지를 표시한다', () => {
      const state = createBaseState();
      const next = jumpToTag(state, 'nonExistentFunction');

      expect(next.primaryFilename).toBe('app.ts');
      expect(next.commandMessage).toContain('E426: 태그를 찾을 수 없습니다: "nonExistentFunction"');
      expect(next.tagStack ?? []).toHaveLength(0);
    });

    it('popTagStack 실행 시 이전 버퍼와 커서 위치로 완벽히 복귀한다', () => {
      let state = createBaseState();

      // app.ts (line 1, col 16) -> src/utils.ts (add)
      state = jumpToTag(state, 'add');
      expect(state.primaryFilename).toBe('src/utils.ts');

      // Pop -> app.ts (line 1, col 16) 복귀
      state = popTagStack(state);
      expect(state.primaryFilename).toBe('app.ts');
      expect(state.cursor).toEqual({ line: 1, col: 16 });
      expect(state.tagStack).toHaveLength(0);
      expect(state.commandMessage).toContain('tag stack popped: app.ts:2');
    });

    it('스택이 비어 있을 때 popTagStack 실행 시 E73 오류 메시지를 표시한다', () => {
      const state = createBaseState();
      const next = popTagStack(state);
      expect(next.commandMessage).toContain('E73: 태그 스택이 비어 있습니다');
    });

    it('여러 단계 점프(A -> B -> C) 후 연속 Pop 복귀 검증', () => {
      let state = createBaseState();

      // 1. app.ts -> src/utils.ts (add)
      state = jumpToTag(state, 'add');
      expect(state.primaryFilename).toBe('src/utils.ts');

      // 2. src/utils.ts -> src/main.ts (APP_NAME)
      state = jumpToTag(state, 'APP_NAME');
      expect(state.primaryFilename).toBe('src/main.ts');
      expect(state.tagStack).toHaveLength(2);

      // 3. Pop 1회 -> src/utils.ts 복귀
      state = popTagStack(state);
      expect(state.primaryFilename).toBe('src/utils.ts');
      expect(state.tagStack).toHaveLength(1);

      // 4. Pop 2회 -> 원래 app.ts 복귀
      state = popTagStack(state);
      expect(state.primaryFilename).toBe('app.ts');
      expect(state.tagStack).toHaveLength(0);
    });
  });

  describe('formatTagStack (:tags)', () => {
    it('태그 스택 테이블을 정상 서식화한다', () => {
      let state = createBaseState();
      state = jumpToTag(state, 'add');

      const formatted = formatTagStack(state);
      expect(formatted).toContain('# TO tag');
      expect(formatted).toContain('add');
      expect(formatted).toContain('app.ts');
    });
  });

  describe('handleKey 단축키 & Ex 커맨드 통합 검증', () => {
    it('커서 아래의 식별자에서 Ctrl+] 누름 시 정의부로 자동 점프한다', () => {
      let state = createBaseState();
      // cursor is at line 1, col 16 ("add")
      state = handleKey(state, 'Ctrl-]');

      expect(state.primaryFilename).toBe('src/utils.ts');
      expect(state.commandMessage).toContain('tag 1 of 1 "add"');
    });

    it('Ctrl+t 누름 시 직전 위치로 복귀한다', () => {
      let state = createBaseState();
      state = handleKey(state, 'Ctrl-]');
      expect(state.primaryFilename).toBe('src/utils.ts');

      state = handleKey(state, 'Ctrl-t');
      expect(state.primaryFilename).toBe('app.ts');
      expect(state.cursor).toEqual({ line: 1, col: 16 });
    });

    it(':tag add 및 :pop 명령어로도 동일하게 점프 및 복귀한다', () => {
      let state = createBaseState();

      // :tag add
      state = handleKey(state, ':');
      for (const ch of 'tag add') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');
      expect(state.primaryFilename).toBe('src/utils.ts');

      // :pop
      state = handleKey(state, ':');
      for (const ch of 'pop') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');
      expect(state.primaryFilename).toBe('app.ts');
      expect(state.cursor).toEqual({ line: 1, col: 16 });
    });

    it(':tags 명령어로 태그 스택을 확인할 수 있다', () => {
      let state = createBaseState();
      state = handleKey(state, 'Ctrl-]');

      state = handleKey(state, ':');
      for (const ch of 'tags') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(state.commandMessage).toContain('add');
      expect(state.commandMessage).toContain('app.ts');
    });

    it('Wildmenu: :tag ad<Tab> 입력 시 add 태그가 자동 완성된다', () => {
      let state = createBaseState();

      state = handleKey(state, ':');
      for (const ch of 'tag ad') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Tab');

      expect(state.commandBuffer).toBe('tag add');
      expect(state.wildmenu?.active).toBe(true);
    });
  });
});
