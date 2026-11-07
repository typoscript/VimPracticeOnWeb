import { describe, it, expect } from 'vitest';
import {
  ensureBuffers,
  syncCurrentBuffer,
  switchBuffer,
  nextBuffer,
  prevBuffer,
  firstBuffer,
  lastBuffer,
  alternateBuffer,
  editBuffer,
  deleteBuffer,
  formatBufferList,
} from './bufferEngine';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

describe('순정 Vim 버퍼(Buffer) 엔진', () => {
  it('ensureBuffers: 초기 상태에서 1번 기본 버퍼 및 보조 파일 버퍼를 생성한다', () => {
    const state: VimEditorState = {
      lines: ['console.log("hello");'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'app.ts',
      secondaryFilename: 'utils.ts',
      secondaryLines: ['export const add = (a, b) => a + b;'],
    };

    const s = ensureBuffers(state);
    expect(s.buffers).toHaveLength(2);
    expect(s.buffers![0].id).toBe(1);
    expect(s.buffers![0].name).toBe('app.ts');
    expect(s.buffers![0].lines).toEqual(['console.log("hello");']);

    expect(s.buffers![1].id).toBe(2);
    expect(s.buffers![1].name).toBe('utils.ts');
    expect(s.buffers![1].lines).toEqual(['export const add = (a, b) => a + b;']);

    expect(s.currentBufferId).toBe(1);
    expect(s.alternateBufferId).toBe(2);
  });

  it('syncCurrentBuffer: 현재 편집 중인 텍스트와 커서 위치를 버퍼 목록에 동기화한다', () => {
    let state: VimEditorState = {
      lines: ['line 1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'main.ts',
    };
    state = ensureBuffers(state);

    // lines 및 cursor 직접 변경 후 동기화
    state.lines = ['line 1', 'line 2 modified'];
    state.cursor = { line: 1, col: 4 };
    const synced = syncCurrentBuffer(state);

    const b1 = synced.buffers?.find((b) => b.id === 1);
    expect(b1?.lines).toEqual(['line 1', 'line 2 modified']);
    expect(b1?.cursor).toEqual({ line: 1, col: 4 });
  });

  it('switchBuffer: 버퍼 번호, 이름 및 # 대안 버퍼로 전환한다', () => {
    let state: VimEditorState = {
      lines: ['buffer 1 text'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'first.ts',
      secondaryFilename: 'second.ts',
      secondaryLines: ['buffer 2 text'],
    };
    state = ensureBuffers(state);

    // 2번 버퍼로 전환
    state = switchBuffer(state, 2);
    expect(state.currentBufferId).toBe(2);
    expect(state.alternateBufferId).toBe(1);
    expect(state.lines).toEqual(['buffer 2 text']);
    expect(state.primaryFilename).toBe('second.ts');

    // 대안 버퍼(#)로 다시 전환
    state = switchBuffer(state, '#');
    expect(state.currentBufferId).toBe(1);
    expect(state.alternateBufferId).toBe(2);
    expect(state.lines).toEqual(['buffer 1 text']);
    expect(state.primaryFilename).toBe('first.ts');

    // alternateBuffer 함수로 다시 전환
    state = alternateBuffer(state);
    expect(state.currentBufferId).toBe(2);

    // 파일 이름 부분 일치 탐색 전환
    state = switchBuffer(state, 'sec');
    expect(state.currentBufferId).toBe(2);
    expect(state.lines).toEqual(['buffer 2 text']);

    // 존재하지 않는 버퍼 요청 시 에러 메시지
    const failed = switchBuffer(state, 'nonexistent');
    expect(failed.commandMessage).toContain('E94');
  });

  it('nextBuffer / prevBuffer: :bn과 :bp로 버퍼를 순회하고 순환(Wrap-around)한다', () => {
    let state: VimEditorState = {
      lines: ['buf1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'file1.ts',
      secondaryFilename: 'file2.ts',
      secondaryLines: ['buf2'],
    };
    state = ensureBuffers(state);

    // 3번째 버퍼 추가
    state = editBuffer(state, 'file3.ts');
    expect(state.buffers).toHaveLength(3);
    expect(state.currentBufferId).toBe(3);

    // :bn -> 1번 버퍼로 순환(Wrap-around)
    state = nextBuffer(state);
    expect(state.currentBufferId).toBe(1);

    // :bn -> 2번 버퍼
    state = nextBuffer(state);
    expect(state.currentBufferId).toBe(2);

    // 2bn ([count] 지원) -> 2번 건너뛰어 1번 버퍼로
    state = nextBuffer(state, 2);
    expect(state.currentBufferId).toBe(1);

    // :bp -> 이전 버퍼 (3번 버퍼로 역순환)
    state = prevBuffer(state);
    expect(state.currentBufferId).toBe(3);
  });

  it('firstBuffer / lastBuffer: :bf와 :bl로 첫 번째 및 마지막 버퍼로 점프한다', () => {
    let state: VimEditorState = {
      lines: ['buf1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'a.ts',
      secondaryFilename: 'b.ts',
      secondaryLines: ['buf2'],
    };
    state = ensureBuffers(state);
    state = editBuffer(state, 'c.ts');

    state = firstBuffer(state);
    expect(state.currentBufferId).toBe(1);
    expect(state.primaryFilename).toBe('a.ts');

    state = lastBuffer(state);
    expect(state.currentBufferId).toBe(3);
    expect(state.primaryFilename).toBe('c.ts');
  });

  it('deleteBuffer: :bd로 버퍼를 삭제하고 안전하게 인접/대안 버퍼로 전환한다', () => {
    let state: VimEditorState = {
      lines: ['buf1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'f1.ts',
      secondaryFilename: 'f2.ts',
      secondaryLines: ['buf2'],
    };
    state = ensureBuffers(state);

    // 2번 버퍼 삭제
    state = deleteBuffer(state, '2');
    expect(state.buffers).toHaveLength(1);
    expect(state.currentBufferId).toBe(1);
    expect(state.lines).toEqual(['buf1']);

    // 마지막 남은 버퍼 삭제 시 crash 없이 [No Name] 초기화
    state = deleteBuffer(state);
    expect(state.buffers).toHaveLength(1);
    expect(state.buffers![0].name).toBe('[No Name]');
    expect(state.lines).toEqual(['']);
  });

  it('formatBufferList: :ls 순정 Vim 형식 포맷팅(% current, # alternate, a active, + modified)', () => {
    let state: VimEditorState = {
      lines: ['modified text'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'foo.ts',
      secondaryFilename: 'bar.ts',
      secondaryLines: ['bar text'],
    };
    state = ensureBuffers(state);
    // 2번으로 전환 후 다시 1번으로 복귀하여 alternate 설정
    state = switchBuffer(state, 2);
    state = switchBuffer(state, 1);

    const listOutput = formatBufferList(state);
    expect(listOutput).toContain('1  %a  "foo.ts"');
    expect(listOutput).toContain('2  #a  "bar.ts"');
  });

  it('Ex 커맨드(:ls, :b, :bn, :bp, :bd, :e) 및 단축키 Ctrl-^ 동작 통합 검증', () => {
    let state: VimEditorState = {
      lines: ['const x = 10;'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'main.ts',
      secondaryFilename: 'test.ts',
      secondaryLines: ['const y = 20;'],
    };

    // :ls 커맨드 실행
    for (const ch of ':ls\n') {
      state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    }
    expect(state.commandMessage).toContain('main.ts');
    expect(state.commandMessage).toContain('test.ts');

    // :bn 커맨드로 다음 버퍼 이동
    for (const ch of ':bn\n') {
      state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    }
    expect(state.currentBufferId).toBe(2);
    expect(state.lines).toEqual(['const y = 20;']);

    // Ctrl-^ 단축키로 이전 버퍼로 즉시 토글
    state = handleKey(state, 'Ctrl-^');
    expect(state.currentBufferId).toBe(1);
    expect(state.lines).toEqual(['const x = 10;']);

    // Ctrl-6 (동일 동작)으로 다시 토글
    state = handleKey(state, 'Ctrl-6');
    expect(state.currentBufferId).toBe(2);
    expect(state.lines).toEqual(['const y = 20;']);

    // :e로 새 버퍼 생성
    for (const ch of ':e newfile.ts\n') {
      state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    }
    expect(state.primaryFilename).toBe('newfile.ts');
    expect(state.buffers).toHaveLength(3);

    // :bd로 새 버퍼 삭제 후 복귀
    for (const ch of ':bd\n') {
      state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    }
    expect(state.buffers).toHaveLength(2);
    expect(state.currentBufferId).toBe(2);
  });
});
