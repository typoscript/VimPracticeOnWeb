import { VimEditorState } from './types';
import { executeSetCommand } from './setEngine';
import { getVfsFile } from './vfs';
import { registerKeymap, unregisterKeymap, parseMapRest, parseUnmapRest } from './keymapEngine';
import { executeAbbrevCommand } from './abbrevEngine';
import { executeUserCommandDefinition } from './userCommandEngine';
import {
  defineFunctionFromLines,
  executeScriptBlock,
  isEndFunctionLine,
  isFunctionHeaderLine,
} from './vimscriptEngine';
import { isSessionScript, restoreSession } from './sessionEngine';
import { msg } from './messages';

/** 소싱 중 let / call / echo 등 Vim script 명령을 실행하기 위한 Ex 실행기 */
export type SourceExRunner = (state: VimEditorState, command: string) => VimEditorState;

const BLOCK_OPEN_RE = /^:?\s*(if|wh(?:i(?:le?)?)?|for|try)\b/;
const BLOCK_CLOSE_RE = /^:?\s*(en(?:d(?:if?)?)?|endw(?:h(?:i(?:le?)?)?)?|endfo(?:r)?|endt(?:r(?:y)?)?)\b/;

/** Vim script 줄 이음(\)과 인라인 연속 주석("\\)을 하나의 논리 줄로 결합합니다. */
function joinLineContinuations(rawLines: string[]): string[] {
  const joined: string[] = [];
  for (const raw of rawLines) {
    const trimmed = raw.trimStart();
    if (trimmed.startsWith('"\\ ') || trimmed === '"\\') {
      continue;
    }
    if (trimmed.startsWith('\\') && joined.length > 0) {
      const piece = trimmed.slice(1).trimStart();
      joined[joined.length - 1] = piece ? `${joined[joined.length - 1]} ${piece}` : joined[joined.length - 1];
      continue;
    }
    joined.push(raw);
  }
  return joined;
}

/** 여러 줄에 걸친 제어문 블록(if/while/for/try)을 중첩 깊이에 맞춰 끝 줄까지 수집합니다. */
function collectControlBlock(lines: string[], startIdx: number): { block: string[]; endIdx: number } {
  const first = lines[startIdx].trim();
  const block: string[] = [first];
  // 한 줄 파이프 형태 (if x | ... | endif)는 블록 수집을 건너뜀
  if (first.includes('|') && /\b(endif|en|endwhile|endw|endfor|endfo|endtry|endt)\b/.test(first)) {
    return { block, endIdx: startIdx };
  }
  let depth = 1;
  let end = startIdx;
  while (end + 1 < lines.length && depth > 0) {
    end++;
    const cur = lines[end].trim();
    block.push(cur);
    if (!cur || cur.startsWith('"')) continue;
    if (BLOCK_OPEN_RE.test(cur) && !(cur.includes('|') && BLOCK_CLOSE_RE.test(cur.split('|').pop() ?? ''))) {
      depth++;
    } else if (BLOCK_CLOSE_RE.test(cur)) {
      depth--;
    }
  }
  return { block, endIdx: end };
}

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
      const vfsLines = getVfsFile(state.netrw?.files, target, state.virtualFiles);

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

  // 세션 스크립트 파일인 경우 세션 복원 전용 엔진으로 위임
  if (isSessionScript(linesToRun)) {
    return restoreSession(state, linesToRun, sourceName, runEx);
  }

  const logicalLines = joinLineContinuations(linesToRun);
  const prevDepth = state.scriptSourcingDepth ?? 0;
  let curState: VimEditorState = { ...state, scriptSourcingDepth: prevDepth + 1, scriptFinished: false };
  let appliedCount = 0;

  for (let idx = 0; idx < logicalLines.length; idx++) {
    if (curState.scriptFinished) break;
    const line = logicalLines[idx].trim();
    if (!line || line.startsWith('"')) {
      // 주석 및 빈 줄 무시
      continue;
    }

    if (/^(?:fin|fini|finis|finish)$/i.test(line)) {
      appliedCount++;
      break;
    }

    // 0. 함수 정의 블록 (function! Name() ... endfunction)
    if (isFunctionHeaderLine(line)) {
      const body: string[] = [];
      let end = idx + 1;
      while (end < logicalLines.length && !isEndFunctionLine(logicalLines[end])) {
        body.push(logicalLines[end]);
        end++;
      }
      curState = defineFunctionFromLines(curState, line, body);
      idx = end;
      appliedCount++;
      continue;
    }

    // 0.5. 다중 줄 제어문 블록 (if/while/for/try ... endif/endwhile/endfor/endtry)
    if (BLOCK_OPEN_RE.test(line) && runEx) {
      const { block, endIdx } = collectControlBlock(logicalLines, idx);
      if (block.length > 1) {
        curState = executeScriptBlock(curState, block, runEx);
        idx = endIdx;
        appliedCount++;
        continue;
      }
    }

    // 1. set 명령어 (:set ...)
    if (line.startsWith('set ')) {
      curState = executeSetCommand(curState, line.slice(4));
      appliedCount++;
      continue;
    }

    // 2. 키매핑 명령어 (inoremap, nnoremap, vnoremap, nmap, imap, vmap, map, noremap 및 <buffer>/<silent>/<expr>)
    const mapMatch = line.match(/^([a-zA-Z]*map|noremap)\s+([\s\S]+)$/i);
    if (mapMatch) {
      const cmdType = mapMatch[1];
      const lowerCmd = cmdType.toLowerCase();
      if (lowerCmd.includes('unmap')) {
        const parsedUnmap = parseUnmapRest(mapMatch[2]);
        if (parsedUnmap) {
          curState = unregisterKeymap(curState, cmdType, parsedUnmap.lhs, { buffer: parsedUnmap.buffer });
          appliedCount++;
          continue;
        }
      } else {
        const parsed = parseMapRest(mapMatch[2]);
        if (parsed) {
          const rhs = parsed.modifiers.expr
            ? parsed.rhs
            : parsed.rhs.replace(/<CR>/gi, 'Enter').replace(/<Esc>/gi, 'Escape');
          curState = registerKeymap(curState, cmdType, parsed.lhs, rhs, parsed.modifiers);
          appliedCount++;
          continue;
        }
      }
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

    // 3.5. 약어 (:iabbrev, :cabbrev, :abbrev, :unabbrev, :abclear 등)
    const abbrevRes = executeAbbrevCommand(curState, line);
    if (abbrevRes) {
      curState = abbrevRes;
      appliedCount++;
      continue;
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

    // 5. Vim script 및 기타 Ex 명령 실행
    if (runEx) {
      curState = runEx(curState, line);
      appliedCount++;
      continue;
    }
  }

  return {
    ...curState,
    scriptSourcingDepth: prevDepth > 0 ? prevDepth : undefined,
    scriptFinished: undefined,
    commandMessage: msg('"{sourceName}" {appliedCount}개 설정 적용 완료 (sourced successfully)', { sourceName, appliedCount }),
  };
}
