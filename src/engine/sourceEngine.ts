import { VimEditorState } from '../types/vim';
import { executeSetCommand } from './setEngine';
import { getVfsFile } from './vfs';

/**
 * .vimrc 또는 스크립트 파일을 한 줄씩 읽어 에디터 상태에 적용합니다 (:source, :so).
 * (:so %, :so ~/.vimrc, :source .vimrc 등)
 */
export function sourceScript(state: VimEditorState, targetFile = '%'): VimEditorState {
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
          commandMessage: `E484: 파일을 열 수 없습니다: "${target}"`,
        };
      }
    }
  }

  let curState = state;
  let appliedCount = 0;

  for (const rawLine of linesToRun) {
    const line = rawLine.trim();
    if (!line || line.startsWith('"')) {
      // 주석 및 빈 줄 무시
      continue;
    }

    // 1. set 명령어 (:set ...)
    if (line.startsWith('set ')) {
      curState = executeSetCommand(curState, line.slice(4));
      appliedCount++;
      continue;
    }

    // 2. 키매핑 명령어 (inoremap, nnoremap, vnoremap 등)
    const mapMatch = line.match(/^(?:inoremap|nnoremap|vnoremap|nmap|imap)\s+(\S+)\s+(.+)$/);
    if (mapMatch) {
      const fromKey = mapMatch[1];
      const toKey = mapMatch[2].replace(/<CR>/gi, 'Enter').replace(/<Esc>/gi, 'Escape');
      const userKeymaps = { ...(curState.userKeymaps ?? {}) };
      userKeymaps[fromKey] = toKey;
      curState = {
        ...curState,
        userKeymaps,
      };
      appliedCount++;
      continue;
    }

    // 3. 리더키 설정 (let mapleader = "..." 또는 let g:mapleader = "...")
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
  }

  return {
    ...curState,
    commandMessage: `"${sourceName}" ${appliedCount}개 설정 적용 완료 (sourced successfully)`,
  };
}
