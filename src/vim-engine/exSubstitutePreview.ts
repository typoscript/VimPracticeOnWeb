// inccommand 실시간 :s 미리보기 (exSubstitute.ts 에서 분리)
import { VimEditorState, IncCommandPreview, IncCommandPreviewMatch } from './types';
import { compileVimRegex } from './vimRegex';
import { getOptions } from './setEngine';
import { extractRangeAndCommand } from './exRange';
import { expandReplacementTilde, makeReplacer, resolveSubstituteIgnoreCase } from './exSubstituteReplace';

/**
 * 실시간 타이핑 중인 :s/old 또는 :s/old/new/flags 문자열을 파싱합니다 (두 번째 구분자가 아직 없어도 허용).
 */
export function parseLiveSubstitutionCommand(cmd: string): {
  oldText: string;
  newText: string;
  flags: string;
  hasReplacement: boolean;
} | null {
  const m = cmd.match(/^(?:s|sub|subst|substi|substit|substitu|substitut|substitute)(?![a-zA-Z])\s*/);
  if (!m) return null;
  const afterS = cmd.slice(m[0].length);
  if (afterS.length === 0) return null;

  const delim = afterS[0];
  if (/[a-zA-Z0-9\s"|]/.test(delim)) {
    return null;
  }

  let idx = 1;
  let oldText = '';
  while (idx < afterS.length) {
    if (afterS[idx] === '\\' && idx + 1 < afterS.length) {
      oldText += '\\' + afterS[idx + 1];
      idx += 2;
      continue;
    }
    if (afterS[idx] === delim) {
      break;
    }
    oldText += afterS[idx];
    idx++;
  }

  if (idx >= afterS.length || afterS[idx] !== delim) {
    return { oldText, newText: '', flags: '', hasReplacement: false };
  }

  idx++;
  let newText = '';
  while (idx < afterS.length) {
    if (afterS[idx] === '\\' && idx + 1 < afterS.length) {
      if (afterS[idx + 1] === delim) {
        newText += delim;
        idx += 2;
        continue;
      }
      newText += '\\' + afterS[idx + 1];
      idx += 2;
      continue;
    }
    if (afterS[idx] === delim) {
      break;
    }
    newText += afterS[idx];
    idx++;
  }

  let flags = '';
  if (idx < afterS.length && afterS[idx] === delim) {
    flags = afterS.slice(idx + 1).trim();
  }

  return { oldText, newText, flags, hasReplacement: true };
}

/**
 * :set inccommand=nosplit|split 활성 상태에서 :[range]s/pat/rep/[flags] 타이핑 중
 * 실시간 매치 및 치환 결과 미리보기를 계산합니다.
 */
export function computeIncCommandPreview(
  state: VimEditorState,
  rawCommandBuffer?: string
): IncCommandPreview | null {
  const opts = getOptions(state);
  const icm = opts.inccommand ?? 'nosplit';
  if (!icm) return null;

  const rawBuf = (rawCommandBuffer ?? state.commandBuffer ?? '').trimStart();
  if (!rawBuf) return null;

  const extracted = extractRangeAndCommand(rawBuf, state);
  if (extracted.error) return null;

  const range = extracted.hasRange && extracted.range
    ? extracted.range
    : { startLine: state.cursor.line, endLine: state.cursor.line };

  const parsed = parseLiveSubstitutionCommand(extracted.command);
  if (!parsed) return null;

  const pattern =
    parsed.oldText.length > 0
      ? parsed.oldText
      : parsed.hasReplacement
      ? state.lastSubstitute?.pattern ?? state.lastSearchQuery ?? ''
      : '';
  if (!pattern) return null;

  const isGlobal = parsed.flags.includes('g');
  const isIgnoreCase = resolveSubstituteIgnoreCase(pattern, parsed.flags, state);
  const tildeText = state.lastSubstitute?.replacement;
  const replacement = expandReplacementTilde(parsed.newText, tildeText);

  let regex: RegExp;
  try {
    regex = compileVimRegex(pattern, {
      ignorecase: isIgnoreCase,
      flags: 'g',
      lastSubstitute: tildeText,
    });
  } catch {
    return null;
  }

  const isCountOnly = parsed.flags.includes('n');
  const applyPreviewReplace = parsed.hasReplacement && !isCountOnly;
  const replacer = applyPreviewReplace ? makeReplacer(replacement, state) : null;
  const previewLines = [...state.lines];
  const matches: IncCommandPreviewMatch[] = [];

  for (let l = range.startLine; l <= range.endLine && l < state.lines.length; l++) {
    const lineText = state.lines[l] ?? '';
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    let outLine = '';
    let lastEnd = 0;
    let lineMatchCount = 0;

    while ((match = regex.exec(lineText)) !== null) {
      const mCol = match.index;
      const mText = match[0];
      const mLen = mText.length > 0 ? mText.length : 1;
      const groups = match.slice(1);

      let repText = mText;
      if (replacer) {
        try {
          repText = replacer(mText, groups, l);
        } catch {
          repText = mText;
        }
      }

      matches.push({
        line: l,
        col: mCol,
        length: mLen,
        matchedText: mText,
        replacement: repText,
      });

      if (applyPreviewReplace) {
        outLine += lineText.slice(lastEnd, mCol) + repText;
        lastEnd = mCol + mText.length;
      }

      lineMatchCount++;
      if (!isGlobal && parsed.hasReplacement && lineMatchCount >= 1) {
        break;
      }
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }

    if (applyPreviewReplace && lineMatchCount > 0) {
      outLine += lineText.slice(lastEnd);
      previewLines[l] = outLine;
    }
  }

  return {
    range,
    pattern,
    replacement,
    flags: parsed.flags,
    hasReplacement: applyPreviewReplace,
    previewLines,
    matches,
  };
}
