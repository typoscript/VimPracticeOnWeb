import { VimEditorState } from './types';
import { undo, redo } from './operators';
import { msg } from './messages';
import { formatUndoList, jumpUndoSeq, travelEarlier, travelLater } from './undoTreeEngine';
import { bufdo } from './bufferEngine';
import { tabdo } from './tabEngine';
import { windo, syncScrollbind } from './splitWindow';
import { cdo, cfdo } from './quickfixEngine';
import { ldo, lfdo } from './locationListEngine';
import {
  setArgs,
  addArgs,
  deleteArgs,
  nextArg,
  prevArg,
  firstArg,
  lastArg,
  formatArgs,
  argdo,
} from './argEngine';
import type { ExCommandRunner } from './exWorkspaceCommands';

function finishNormalEx(res: VimEditorState): VimEditorState {
  return {
    ...res,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
  };
}

/**
 * 아규먼트·배치 실행(:argdo/:bufdo/:tabdo/:windo/:cdo/:ldo)·Undo Tree Ex 명령을 처리합니다.
 * 일치하는 명령이 없으면 null 을 반환합니다.
 */
export function tryExecuteBatchAndUndoExCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  cleanCmd: string,
  trimmed: string,
  runEx: ExCommandRunner
): VimEditorState | null {
  // 아규먼트 일괄 실행: :argdo[!] {cmd}
  const argdoMatch = cleanCmdRaw.match(/^argdo(!?)(?:\s+(.*))?$/i);
  if (argdoMatch) {
    return finishNormalEx(argdo(state, argdoMatch[2] ?? '', runEx, argdoMatch[1] === '!'));
  }

  // 버퍼 일괄 실행: :bufdo[!] {cmd}
  const bufdoMatch = cleanCmdRaw.match(/^bufdo(!?)(?:\s+(.*))?$/i);
  if (bufdoMatch) {
    return finishNormalEx(bufdo(state, bufdoMatch[2] ?? '', runEx, bufdoMatch[1] === '!'));
  }

  // 탭 일괄 실행: :tabdo[!] {cmd}
  const tabdoMatch = cleanCmdRaw.match(/^tabdo(!?)(?:\s+(.*))?$/i);
  if (tabdoMatch) {
    return finishNormalEx(tabdo(state, tabdoMatch[2] ?? '', runEx, tabdoMatch[1] === '!'));
  }

  // 창 일괄 실행: :windo[!] {cmd}
  const windoMatch = cleanCmdRaw.match(/^windo(!?)(?:\s+(.*))?$/i);
  if (windoMatch) {
    return finishNormalEx(windo(state, windoMatch[2] ?? '', runEx, windoMatch[1] === '!'));
  }

  // 동기 스크롤 위치 맞춤: :syncbind / :syncb
  if (/^syncb(?:ind)?$/i.test(cleanCmd)) {
    return finishNormalEx(syncScrollbind(state));
  }

  // 퀵픽스 일괄 실행: :cdo[!] {cmd}, :cfdo[!] {cmd}
  const cdoMatch = cleanCmdRaw.match(/^(cdo|cfdo)(!?)(?:\s+(.*))?$/i);
  if (cdoMatch) {
    const isFile = cdoMatch[1].toLowerCase() === 'cfdo';
    const isBang = cdoMatch[2] === '!';
    const cmdToRun = cdoMatch[3] ?? '';
    const res = isFile
      ? cfdo(state, cmdToRun, runEx, isBang)
      : cdo(state, cmdToRun, runEx, false, isBang);
    return finishNormalEx(res);
  }

  // 로케이션 리스트 일괄 실행: :ldo[!] {cmd}, :lfdo[!] {cmd}
  const ldoMatch = cleanCmdRaw.match(/^(ldo|lfdo)(!?)(?:\s+(.*))?$/i);
  if (ldoMatch) {
    const isFile = ldoMatch[1].toLowerCase() === 'lfdo';
    const isBang = ldoMatch[2] === '!';
    const cmdToRun = ldoMatch[3] ?? '';
    const res = isFile
      ? lfdo(state, cmdToRun, runEx, isBang)
      : ldo(state, cmdToRun, runEx, false, isBang);
    return finishNormalEx(res);
  }

  // 아규먼트 추가: :argadd {file} ...
  const argaddMatch = cleanCmdRaw.match(/^argadd\s+(.*)$/i);
  if (argaddMatch) {
    return finishNormalEx(addArgs(state, argaddMatch[1].trim().split(/\s+/)));
  }

  // 아규먼트 삭제: :argdelete {pattern}, :argd {pattern}
  const argdMatch = cleanCmdRaw.match(/^(?:argdelete|argd)\s+(.*)$/i);
  if (argdMatch) {
    return finishNormalEx(deleteArgs(state, argdMatch[1].trim()));
  }

  // 아규먼트 설정 및 조회: :args [file1 file2 ...]
  const argsMatch = cleanCmdRaw.match(/^args(?:\s+(.*))?$/i);
  if (argsMatch) {
    const filesStr = argsMatch[1]?.trim();
    if (filesStr) {
      return finishNormalEx(setArgs(state, filesStr.split(/\s+/)));
    }
    return {
      ...finishNormalEx(state),
      commandMessage: formatArgs(state),
    };
  }

  // 아규먼트 다음 파일 이동: :next, :n ([count] 지원)
  const nextArgMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:next|n)(?:\s+(\d+))?$/i);
  if (nextArgMatch) {
    const countRaw = nextArgMatch[1] || nextArgMatch[2];
    return finishNormalEx(nextArg(state, countRaw ? parseInt(countRaw, 10) : 1));
  }

  // 아규먼트 이전 파일 이동: :prev, :previous, :Next, :N ([count] 지원)
  const prevArgMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:prev|previous|Next|N)(?:\s+(\d+))?$/);
  if (prevArgMatch) {
    const countRaw = prevArgMatch[1] || prevArgMatch[2];
    return finishNormalEx(prevArg(state, countRaw ? parseInt(countRaw, 10) : 1));
  }

  // 아규먼트 양 끝 파일 이동: :first, :fir, :rewind, :rew, :last, :la
  if (cleanCmd === 'first' || cleanCmd === 'fir' || cleanCmd === 'rewind' || cleanCmd === 'rew') {
    return finishNormalEx(firstArg(state));
  }
  if (cleanCmd === 'last' || cleanCmd === 'la') {
    return finishNormalEx(lastArg(state));
  }

  // Undo Tree 목록 확인: :undolist, :undol
  if (cleanCmd === 'undolist' || cleanCmd === 'undol') {
    return {
      ...finishNormalEx(state),
      commandMessage: formatUndoList(state),
    };
  }

  // 이전/이후 상태로 시간 여행: :earlier / :later
  const earlierMatch = trimmed.match(/^:?\s*(?:earlier|ea)(?:\s+(.*))?$/i);
  if (earlierMatch) {
    return finishNormalEx(travelEarlier(state, earlierMatch[1]));
  }

  const laterMatch = trimmed.match(/^:?\s*(?:later|lat)(?:\s+(.*))?$/i);
  if (laterMatch) {
    return finishNormalEx(travelLater(state, laterMatch[1]));
  }

  // 변경 번호로 직접 이동: :undo {seq}, :u {seq}
  const undoJumpMatch = trimmed.match(/^:?\s*u(?:ndo)?\s+(\d+)$/i);
  if (undoJumpMatch) {
    return finishNormalEx(jumpUndoSeq(state, parseInt(undoJumpMatch[1], 10)));
  }

  // 다음 변경을 직전 Undo 블록과 병합: :undojoin / :undoj
  if (/^undoj(?:o(?:i(?:n)?)?)?$/i.test(cleanCmd)) {
    if (state.lastActionWasUndo) {
      return finishNormalEx({
        ...state,
        bell: true,
        commandMessage: msg('E790: undojoin 은 실행 취소(undo) 직후에 사용할 수 없습니다'),
      });
    }
    return finishNormalEx({
      ...state,
      pendingUndoJoin: true,
    });
  }

  // 단순 실행 취소 및 재실행: :u, :undo, :red, :redo
  if (cleanCmd === 'u' || cleanCmd === 'undo') {
    return finishNormalEx(undo(state));
  }
  if (cleanCmd === 'red' || cleanCmd === 'redo') {
    return finishNormalEx(redo(state));
  }

  return null;
}
