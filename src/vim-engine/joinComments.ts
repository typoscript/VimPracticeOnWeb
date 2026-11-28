/**
 * J / gJ / :j 의 주석 리더 제거 ('formatoptions' 의 j) — Neovim change.c get_leader_len() 과 ops.c skip_comment() 이식.
 * 'comments' 는 Neovim 기본값 `s1:/*,mb:*,ex:*\/,://,b:#,:%,:XCOMM,n:>,fb:-` 입니다.
 */

interface CommentPart {
  flags: string;
  str: string;
}

const DEFAULT_COMMENTS: CommentPart[] = [
  { flags: 's1', str: '/*' },
  { flags: 'mb', str: '*' },
  { flags: 'ex', str: '*/' },
  { flags: '', str: '//' },
  { flags: 'b', str: '#' },
  { flags: '', str: '%' },
  { flags: '', str: 'XCOMM' },
  { flags: 'n', str: '>' },
  { flags: 'fb', str: '-' },
];

const isWhite = (c: string | undefined) => c === ' ' || c === '\t';

/** Vim get_leader_len: 줄 앞 주석 리더의 길이와 맞은 항목의 플래그 (없으면 길이 0) */
export function commentLeaderLen(line: string, includeSpace: boolean): { len: number; flags: string } {
  let i = 0;
  while (isWhite(line[i])) i++;
  let result = 0;
  let resultFlags = '';
  let gotCom = false;
  while (i < line.length) {
    let foundOne = false;
    let middleLen = 0;
    let middleFlags = '';
    let matchedFlags = '';
    for (const part of DEFAULT_COMMENTS) {
      if (middleLen !== 0 && !part.flags.includes('m') && !part.flags.includes('e')) break;
      if (gotCom && !part.flags.includes('n')) continue;
      if (!line.startsWith(part.str, i)) continue;
      const after = line[i + part.str.length];
      if (part.flags.includes('b') && !isWhite(after) && after !== undefined) continue;
      if (part.flags.includes('m')) {
        if (middleLen === 0) {
          middleLen = part.str.length;
          middleFlags = part.flags;
        }
        continue;
      }
      if (middleLen !== 0 && part.str.length > middleLen) middleLen = 0;
      if (middleLen === 0) i += part.str.length;
      matchedFlags = part.flags;
      foundOne = true;
      break;
    }
    if (middleLen !== 0) {
      i += middleLen;
      matchedFlags = middleFlags;
      foundOne = true;
    }
    if (!foundOne) break;
    result = i;
    while (isWhite(line[i])) i++;
    if (includeSpace) result = i;
    if (!gotCom) resultFlags = matchedFlags;
    gotCom = true;
    if (!matchedFlags.includes('n')) break;
  }
  return { len: result, flags: resultFlags };
}

/**
 * Vim get_last_leader_offset(): 줄 안 가장 오른쪽 주석 리더의 플래그 (줄 가운데의 `// ` · ` - ` · `%` 도 셉니다,
 * 가운데 부분 `*` 는 앞이 공백뿐일 때만). 없으면 null.
 */
function lastLeaderFlags(line: string): string | null {
  for (let i = line.length - 1; i >= 0; i--) {
    for (const part of DEFAULT_COMMENTS) {
      if (!line.startsWith(part.str, i)) continue;
      const after = line[i + part.str.length];
      if (part.flags.includes('b') && !isWhite(after) && after !== undefined) continue;
      if (part.flags.includes('m') && line.slice(0, i).trim() !== '') continue;
      return part.flags;
    }
  }
  return null;
}

/**
 * Vim skip_comment(): 앞 줄이 주석이었으면 이 줄의 리더를 지운 나머지를 돌려줍니다 (세 부분 주석의 끝 `*\/` 는 남김).
 * isComment 는 이 줄이 주석인지 (다음 줄 판단용).
 */
export function skipJoinComment(line: string, process: boolean, includeSpace: boolean): { rest: string; isComment: boolean } {
  const lastFlags = lastLeaderFlags(line);
  const isComment = lastFlags !== null && !lastFlags.includes('e');
  const lead = commentLeaderLen(line, includeSpace);
  if (!process || lead.len === 0 || lead.flags.includes('e')) return { rest: line, isComment };
  return { rest: line.slice(lead.len), isComment };
}
