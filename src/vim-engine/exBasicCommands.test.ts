import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  configureVimEngine,
  createVimState,
  handleKey,
  runExCommand,
  sendKeys,
  VimEditorState,
} from './index';

describe('Ex & Command-line Basic Commands', () => {
  beforeEach(() => {
    configureVimEngine({
      locale: 'ko',
      workspaceFiles: {
        'src/main.ts': ['console.log("main");'],
        'src/utils/helper.ts': ['export const a = 1;'],
        'README.md': ['# Docs'],
      },
    });
  });

  afterEach(() => {
    configureVimEngine({ locale: 'ko' });
  });

  describe(':enew[!] & :file / :f & :saveas[!]', () => {
    it(':enew 는 clean 상태에서 새 [No Name] 버퍼를 열고, 수정 상태에서는 E37을 내며 :enew! 로 강제 전환한다', () => {
      let s = createVimState(['hello world'], undefined, { primaryFilename: 'app.ts' });
      s = runExCommand(s, 'enew');
      expect(s.bell).toBeFalsy();
      expect(s.primaryFilename).toBe('[No Name]');
      expect(s.lines).toEqual(['']);
      expect(s.buffers).toHaveLength(2);

      // 이전 버퍼로 복귀 후 수정
      s = handleKey(s, 'Ctrl-^');
      expect(s.primaryFilename).toBe('app.ts');
      s = sendKeys(s, 'x');
      expect(s.lines).toEqual(['ello world']);

      // 수정된 버퍼에서 ! 없이 :enew 시 E37 실패
      s = runExCommand(s, 'enew');
      expect(s.bell).toBe(true);
      expect(s.commandMessage).toContain('E37');
      expect(s.primaryFilename).toBe('app.ts');

      // :enew! 는 강제 새 버퍼 생성
      s = runExCommand(s, 'enew!');
      expect(s.bell).toBeFalsy();
      expect(s.primaryFilename).toBe('[No Name]');
      expect(s.lines).toEqual(['']);
    });

    it(':file / :f 로 현재 버퍼 정보 조회 및 파일명을 변경하며 :files/:find 를 가리지 않는다', () => {
      let s = createVimState(['line1', 'line2'], undefined, { primaryFilename: 'old.ts' });
      const info = runExCommand(s, 'f');
      expect(info.commandMessage).toContain('"old.ts"');
      expect(info.commandMessage).toContain('2줄');

      s = sendKeys(s, 'x');
      const dirtyInfo = runExCommand(s, 'file');
      expect(dirtyInfo.commandMessage).toContain('[수정됨]');

      s = runExCommand(s, 'file renamed.ts');
      expect(s.primaryFilename).toBe('renamed.ts');
      expect(s.commandMessage).toContain('"renamed.ts"');
      expect(s.virtualFiles?.['renamed.ts']).toBeUndefined();

      // :files 는 여전히 버퍼 목록을 반환
      const filesOut = runExCommand(s, 'files');
      expect(filesOut.commandMessage).toContain('renamed.ts');
    });

    it(':saveas[!] 는 다른 파일명으로 VFS 에 저장하며, 기존 파일 충돌 시 ! 없이 E13 을 발생시킨다', () => {
      let s = createVimState(['saved body'], undefined, { primaryFilename: 'draft.ts' });
      s = sendKeys(s, 'x');

      // 인자 없음 -> E471
      const noArg = runExCommand(s, 'saveas');
      expect(noArg.bell).toBe(true);
      expect(noArg.commandMessage).toContain('E471');

      // 존재하는 VFS 파일 덮어쓰기 시도 -> E13
      const conflict = runExCommand(s, 'saveas README.md');
      expect(conflict.bell).toBe(true);
      expect(conflict.commandMessage).toContain('E13');

      // 강제 덮어쓰기 :saveas! README.md 성공
      const overwritten = runExCommand(s, 'saveas! README.md');
      expect(overwritten.bell).toBeFalsy();
      expect(overwritten.primaryFilename).toBe('README.md');
      expect(overwritten.virtualFiles?.['README.md']).toEqual(['aved body']);

      // 신규 이름으로 저장 시 dirty 해제됨
      const savedNew = runExCommand(s, 'saveas fresh.ts');
      expect(savedNew.primaryFilename).toBe('fresh.ts');
      expect(savedNew.virtualFiles?.['fresh.ts']).toEqual(['aved body']);
      expect(runExCommand(savedNew, 'enew').bell).toBeFalsy();
    });
  });

  describe(':bunload[!], :bwipeout[!], :wa, :qa[!], :wqa[!], :xa[!]', () => {
    it(':bunload / :bwipeout 은 수정된 버퍼에 E89 를 반환하고 ! 시 언로드/완전 제거한다', () => {
      let s = createVimState(['one'], undefined, {
        primaryFilename: 'a.ts',
        secondaryFilename: 'b.ts',
        secondaryLines: ['two'],
        bufferLocalOptions: { 1: { number: true }, 2: { number: false } },
      });
      s = sendKeys(s, 'x'); // 1번 버퍼 수정

      // ! 없이 :bun -> E89
      const failBun = runExCommand(s, 'bun');
      expect(failBun.bell).toBe(true);
      expect(failBun.commandMessage).toContain('E89');

      // :bw! 1 -> 버퍼 1 제거, bufferLocalOptions[1]도 정리, 2번으로 전환
      s = runExCommand(s, 'bw! 1');
      expect(s.bell).toBeFalsy();
      expect(s.currentBufferId).toBe(2);
      expect(s.primaryFilename).toBe('b.ts');
      expect(s.buffers).toHaveLength(1);
      expect(s.bufferLocalOptions?.[1]).toBeUndefined();

      // :e c.ts 추가 후 :bunload 로 언로드
      s = runExCommand(s, 'e c.ts');
      expect(s.buffers).toHaveLength(2);
      s = runExCommand(s, 'bunload');
      expect(s.buffers).toHaveLength(1);
    });

    it(':wa, :qa[!], :wqa, :xa 가 다중 버퍼 저장 및 전체 창/탭/패널 닫기를 처리한다', () => {
      let s: VimEditorState = {
        ...createVimState(['alpha'], undefined, {
          primaryFilename: 'a.ts',
          secondaryFilename: 'b.ts',
          secondaryLines: ['beta'],
        }),
        splitDirection: 'vertical',
        splitPanes: [
          {
            lines: ['alpha'],
            cursor: { line: 0, col: 0 },
            mode: 'NORMAL',
            filename: 'a.ts',
          },
          {
            lines: ['beta'],
            cursor: { line: 0, col: 0 },
            mode: 'NORMAL',
            filename: 'b.ts',
          },
        ],
        activePaneIndex: 0,
      };
      s = sendKeys(s, 'x'); // a.ts 수정 ('lpha')

      // ! 없는 :qa 는 E37
      const failQa = runExCommand(s, 'qa');
      expect(failQa.bell).toBe(true);
      expect(failQa.commandMessage).toContain('E37');
      expect(failQa.splitDirection).toBe('vertical');

      // :wa 로 모든 이름 있는 버퍼 저장 후 clean 상태 확인
      const afterWa = runExCommand(s, 'wa');
      expect(afterWa.bell).toBeFalsy();
      expect(afterWa.virtualFiles?.['a.ts']).toEqual(['lpha']);
      expect(afterWa.virtualFiles?.['b.ts']).toEqual(['beta']);

      // 저장 후 :qa 는 분할 창 닫기 성공
      const afterQa = runExCommand(afterWa, 'qa');
      expect(afterQa.bell).toBeFalsy();
      expect(afterQa.splitDirection).toBe('none');

      // :xa / :wqa 는 수정된 버퍼도 저장하고 모든 창 닫기
      const afterXa = runExCommand(s, 'xa');
      expect(afterXa.bell).toBeFalsy();
      expect(afterXa.virtualFiles?.['a.ts']).toEqual(['lpha']);
      expect(afterXa.splitDirection).toBe('none');

      // 이름 없는 수정 버퍼에 대한 :wa -> E141
      let unnamed = createVimState(['hello'], undefined, { primaryFilename: '[No Name]' });
      unnamed = sendKeys(unnamed, 'x');
      const failWa = runExCommand(unnamed, 'wa');
      expect(failWa.bell).toBe(true);
      expect(failWa.commandMessage).toContain('E141');

      // :qa! 는 저장 없이 강제 종료
      const forceQa = runExCommand(unnamed, 'qa!');
      expect(forceQa.bell).toBeFalsy();
    });
  });

  describe(':pwd, :cd, :lcd 및 명령행 Ctrl-d 자동완성 목록', () => {
    it(':pwd / :cd / :lcd 가 작업 디렉터리를 이동·검증하고 :e 및 :!pwd 와 연동한다', () => {
      let s = createVimState(['init']);
      expect(runExCommand(s, 'pwd').commandMessage).toBe('/workspace');
      expect(runExCommand(s, '!pwd').commandMessage).toContain('/workspace');

      s = runExCommand(s, 'cd src');
      expect(s.bell).toBeFalsy();
      expect(s.cwd).toBe('/workspace/src');
      expect(runExCommand(s, 'pwd').commandMessage).toBe('/workspace/src');

      // :cd src 상태에서 상대 경로 :e utils/helper.ts 로드 가능
      s = runExCommand(s, 'e utils/helper.ts');
      expect(s.primaryFilename).toBe('src/utils/helper.ts');
      expect(s.lines).toEqual(['export const a = 1;']);

      // :lcd .. 로 복귀
      s = runExCommand(s, 'lcd ..');
      expect(s.cwd).toBe('/workspace');

      // 존재하지 않는 디렉터리 -> E344
      const badCd = runExCommand(s, 'cd no_such_dir');
      expect(badCd.bell).toBe(true);
      expect(badCd.commandMessage).toContain('E344');
    });

    it('커맨드라인 Ctrl-d 가 명령·디렉터리 후보 목록을 commandBuffer 변경 없이 출력한다', () => {
      let s = createVimState(['one']);
      s = sendKeys(s, ':qa');
      s = handleKey(s, 'Ctrl-d');
      expect(s.mode).toBe('COMMAND');
      expect(s.commandBuffer).toBe('qa');
      expect(s.commandMessage).toContain('qa');
      expect(s.commandMessage).toContain('qall');

      // :cd 뒤 Ctrl-d -> VFS 디렉터리 후보 출력
      let dirState = sendKeys(createVimState(['one']), ':cd s');
      dirState = handleKey(dirState, 'Ctrl-d');
      expect(dirState.mode).toBe('COMMAND');
      expect(dirState.commandBuffer).toBe('cd s');
      expect(dirState.commandMessage).toContain('src');
    });
  });

  describe(':[range]j[oin][!], :[range]>[>], :[range]<[<], :[range]p/nu/#/l', () => {
    it(':[range]j[oin][!] [count] 가 Neovim 규격대로 줄 병합 및 undo 를 처리한다', () => {
      const base = ['  alpha  ', '  beta', '  gamma', '  delta'];

      // :1j
      const s1 = runExCommand(createVimState(base), '1j');
      expect(s1.lines).toEqual(['  alpha  beta', '  gamma', '  delta']);
      expect(s1.cursor).toEqual({ line: 0, col: 2 });

      // :1j!
      const s1Bang = runExCommand(createVimState(base), '1j!');
      expect(s1Bang.lines).toEqual(['  alpha    beta', '  gamma', '  delta']);
      expect(s1Bang.cursor).toEqual({ line: 0, col: 2 });

      // :j 3
      const j3 = runExCommand(createVimState(base), 'j 3');
      expect(j3.lines).toEqual(['  alpha  beta gamma', '  delta']);

      // :2,3j 2 (endLine=3부터 2줄 합침)
      const r23j2 = runExCommand(createVimState(base), '2,3j 2');
      expect(r23j2.lines).toEqual(['  alpha  ', '  beta', '  gamma delta']);

      // :%j 빈 줄 포함
      const pct = runExCommand(createVimState(['  alpha', '  beta', '', '  delta']), '%j');
      expect(pct.lines).toEqual(['  alpha beta delta']);

      // u 로 undo 가능
      const undone = handleKey(s1, 'u');
      expect(undone.lines).toEqual(base);

      // :jumps 는 가려지지 않고 정상 동작
      const jumpsOut = runExCommand(createVimState(base), 'jumps');
      expect(jumpsOut.commandMessage).not.toContain('하나로 합쳤습니다');
    });

    it(':[range]>[>] 및 :[range]<[<] 가 shiftwidth 를 반영해 들여쓰기·내어쓰기 한다', () => {
      const s = createVimState(['aa', 'bb', '', 'cc']);

      // :1,3> (빈 줄 제외, 커서 3줄 첫 비공백)
      const shifted = runExCommand(s, '1,3>');
      expect(shifted.lines).toEqual(['  aa', '  bb', '', 'cc']);
      expect(shifted.cursor).toEqual({ line: 2, col: 0 });

      // :2>> (2회 들여쓰기 = 4칸)
      const doubled = runExCommand(s, '2>>');
      expect(doubled.lines).toEqual(['aa', '    bb', '', 'cc']);

      // :2> 2 (2번째 줄부터 2줄)
      const counted = runExCommand(createVimState(['aa', 'bb', 'cc', 'dd']), '2> 2');
      expect(counted.lines).toEqual(['aa', '  bb', '  cc', 'dd']);
      expect(counted.cursor).toEqual({ line: 2, col: 2 });

      // :1,3< 내어쓰기
      const unindented = runExCommand(createVimState(['    aa', '  bb', 'cc']), '1,3<');
      expect(unindented.lines).toEqual(['  aa', 'bb', 'cc']);
      expect(unindented.cursor).toEqual({ line: 2, col: 0 });

      // undo 가능
      expect(handleKey(shifted, 'u').lines).toEqual(['aa', 'bb', '', 'cc']);
    });

    it(':[range]p[rint], :[range]nu[mber], :[range]#, :[range]l[ist] 가 줄 내용을 출력한다', () => {
      const s = createVimState(['foo\tbar', 'baz', 'qux']);

      const pOut = runExCommand(s, '1,2p');
      expect(pOut.commandMessage).toBe('foo\tbar\nbaz');
      expect(pOut.cursor.line).toBe(1);

      const nuOut = runExCommand(s, '1,2nu');
      expect(nuOut.commandMessage).toBe('     1  foo\tbar\n     2  baz');

      const hashOut = runExCommand(s, '2,3#');
      expect(hashOut.commandMessage).toBe('     2  baz\n     3  qux');

      const listOut = runExCommand(s, '1,2l');
      expect(listOut.commandMessage).toBe('foo^Ibar$\nbaz$');

      // :left / :ls / :put 를 가리지 않음
      const leftOut = runExCommand(createVimState(['    x']), 'left 0');
      expect(leftOut.lines).toEqual(['x']);
      const lsOut = runExCommand(s, 'ls');
      expect(lsOut.commandMessage).toContain('source.ts');
    });
  });
});
