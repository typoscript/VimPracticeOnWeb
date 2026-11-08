import { VimEditorState } from './types';
import { executeSetCommand } from './setEngine';
import { getVfsFile } from './vfs';
import { registerKeymap } from './keymapEngine';
import { executeUserCommandDefinition } from './userCommandEngine';
import { defineFunctionFromLines, isEndFunctionLine, isFunctionHeaderLine } from './vimscriptEngine';
import { msg } from './messages';

/** 소싱 중 let / call / echo 등 Vim script 명령을 실행하기 위한 Ex 실행기 */
export type SourceExRunner = (state: VimEditorState, command: string) => VimEditorState;

/**
 * .vimrc 또는 스크립트 파일을 한 줄씩 읽어 에디터 상태에 적용합니다 (:source, :so).
 * (:so %, :so ~/.vimrc, :source .vimrc 등)
 */
export function sourceScript(state: VimEditorState, targetFile = '%', runEx?: SourceExRunner): VimEditorState {
  const target = targetFile.trim();
  let linesToRun: string[] = [];
  let sourceName = target;

  if (target === '%' || target === '' || target === state.primaryFilename) {
    linesToRun = [...state.lines];
    sourceName = state.primaryFilename ?? '%';
  } else {
    // 1. 버퍼 목록에서 탐색
    const foundBuf = state.buffers?.find((b) => b.name === target || b.name.endsWith(target));
    if (foundBuf) {
      linesToRun = [...foundBuf.lines];
      sourceName = foundBuf.name;
    } else {
      // 2. VFS(가상 파일 시스템) 또는 시스템 파일에서 탐색
      const vfsLines = getVfsFile(state.netrw?.files, target);

      if (vfsLines) {
        linesToRun = [...vfsLines];
        sourceName = target;
      } else {
        return {
          ...state,
          commandMessage: msg('E484: 파일을 열 수 없습니다: "{target}"', { target }),
        };
      }
    }
  }

  let curState = state;
  let appliedCount = 0;

  for (let idx = 0; idx < linesToRun.length; idx++) {
    const line = linesToRun[idx].trim();
    if (!line || line.startsWith('"')) {
      // 주석 및 빈 줄 무시
      continue;
    }

    // 0. 함수 정의 블록 (function! Name() ... endfunction)
    if (isFunctionHeaderLine(line)) {
      const body: string[] = [];
      let end = idx + 1;
      while (end < linesToRun.length && !isEndFunctionLine(linesToRun[end])) {
        body.push(linesToRun[end]);
        end++;
      }
      curState = defineFunctionFromLines(curState, line, body);
      idx = end;
      appliedCount++;
      continue;
    }

    // 1. set 명령어 (:set ...)
    if (line.startsWith('set ')) {
      curState = executeSetCommand(curState, line.slice(4));
      appliedCount++;
      continue;
    }

    // 2. 키매핑 명령어 (inoremap, nnoremap, vnoremap, nmap, imap, vmap, map, noremap 등)
    const mapMatch = line.match(/^([a-zA-Z]+map|noremap)\s+(\S+)\s+(.+)$/i);
    if (mapMatch) {
      const cmdType = mapMatch[1];
      const fromKey = mapMatch[2];
      const toKey = mapMatch[3].replace(/<CR>/gi, 'Enter').replace(/<Esc>/gi, 'Escape');
      curState = registerKeymap(curState, cmdType, fromKey, toKey);
      appliedCount++;
      continue;
    }

    // 3. 사용자 정의 명령 (command! W w, delcommand W, comclear)
    if (/^(com|delc)/.test(line)) {
      const defined = executeUserCommandDefinition(curState, line);
      if (defined) {
        curState = defined;
        appliedCount++;
        continue;
      }
    }

    // 4. 리더키 설정 (let mapleader = "..." 또는 let g:mapleader = "...")
    const leaderMatch = line.match(/^let\s+(?:g:)?mapleader\s*=\s*["']([^"']+)["']/);
    if (leaderMatch) {
      const leaderVal = leaderMatch[1] === '<Space>' ? ' ' : leaderMatch[1];
      curState = {
        ...curState,
        leaderKey: leaderVal,
      };
      appliedCount++;
      continue;
    }

    // 5. Vim script 명령 (let, unlet, call, echo, execute)
    if (runEx && /^(let|unl|unlet|cal|call|ec|echo|echom|exe|execute)(!?)\s/.test(line)) {
      curState = runEx(curState, line);
      appliedCount++;
      continue;
    }
  }

  return {
    ...curState,
    commandMessage: msg('"{sourceName}" {appliedCount}개 설정 적용 완료 (sourced successfully)', { sourceName, appliedCount }),
  };
}
