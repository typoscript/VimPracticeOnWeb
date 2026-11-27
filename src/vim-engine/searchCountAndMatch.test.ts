import { describe, it, expect } from 'vitest';
import {
  createVimState,
  sendKeys,
  runExCommand,
  evalVimExpression,
  computeSearchCount,
  computeCustomMatchSpans,
  getOptions,
} from './index';

describe('searchcount() & custom pattern highlight (:match / matchadd())', () => {
  it('computeSearchCount 및 Vimscript searchcount() 가 현재 매치 번호·총 개수·exact_match·maxcount 를 정확히 계산한다', () => {
    let state = createVimState([
      'foo bar foo',
      'baz foo qux',
      'foo end',
    ]);

    // /foo<Enter> 는 커서 다음 매치(0, 8)로 가므로 0 으로 첫 매치 (0, 0) 에 둡니다
    state = sendKeys(state, '/foo<CR>0');
    const sc1 = evalVimExpression(state, 'searchcount()');
    expect(sc1.value).toEqual({
      kind: 'dict',
      items: { current: 1, total: 4, exact_match: 1, incomplete: 0, maxcount: 99 },
    });

    // n -> 두 번째 매치 (0, 8)
    state = sendKeys(state, 'n');
    const sc2 = computeSearchCount(state.lines, state.lastSearchQuery ?? '', state.cursor);
    expect(sc2).toEqual({ current: 2, total: 4, exact_match: 1, incomplete: 0, maxcount: 99 });

    // 딕셔너리 인자로 패턴과 maxcount 지정
    const scMax = evalVimExpression(state, "searchcount({'pattern': 'foo', 'maxcount': 2})");
    expect(scMax.value).toEqual({
      kind: 'dict',
      items: { current: 2, total: 3, exact_match: 1, incomplete: 2, maxcount: 2 },
    });

    // :set shortmess+=S / -=S 지원
    state = runExCommand(state, 'set shm+=S');
    expect(getOptions(state).shortmess).toContain('S');
    state = runExCommand(state, 'set shm-=S');
    expect(getOptions(state).shortmess).not.toContain('S');
  });

  it(':match / :2match / :3match / :clearmatches 로 커스텀 정규식 강조를 등록·해제한다', () => {
    let state = createVimState([
      'TODO: fix bug   ',
      'FIXME: check edge',
    ]);

    state = runExCommand(state, 'match ErrorMsg /\\s\\+$/');
    expect(state.customMatches).toHaveLength(1);
    expect(state.customMatches?.[0]).toEqual({
      id: 1,
      group: 'ErrorMsg',
      pattern: '\\s\\+$',
      priority: 10,
    });

    state = runExCommand(state, '2match Todo /TODO\\|FIXME/');
    expect(state.customMatches).toHaveLength(2);

    const spans = computeCustomMatchSpans(state.lines, state.customMatches);
    expect(spans.some((s) => s.group === 'ErrorMsg' && s.line === 0 && s.col === 13 && s.length === 3)).toBe(true);
    expect(spans.some((s) => s.group === 'Todo' && s.line === 0 && s.col === 0 && s.length === 4)).toBe(true);
    expect(spans.some((s) => s.group === 'Todo' && s.line === 1 && s.col === 0 && s.length === 5)).toBe(true);

    // :match none -> slot 1 만 제거
    state = runExCommand(state, 'match none');
    expect(state.customMatches).toHaveLength(1);
    expect(state.customMatches?.[0].id).toBe(2);

    // :clearmatches -> 모두 제거
    state = runExCommand(state, 'clearmatches');
    expect(state.customMatches).toBeUndefined();
  });

  it('Vimscript matchadd() / getmatches() / matchdelete() / clearmatches() 내장 함수가 동작한다', () => {
    let state = createVimState(['alpha beta alpha']);

    state = runExCommand(state, "let g:mid = matchadd('Search', 'alpha', 20)");
    expect(evalVimExpression(state, 'g:mid').value).toBe(4);
    expect(state.customMatches).toEqual([
      { id: 4, group: 'Search', pattern: 'alpha', priority: 20 },
    ]);

    const listRes = evalVimExpression(state, 'len(getmatches())');
    expect(listRes.value).toBe(1);

    // 중복 ID 지정 시 -1 반환
    expect(evalVimExpression(state, "matchadd('Error', 'beta', 10, 4)").value).toBe(-1);

    // matchdelete(4) -> 0 반환 및 제거
    state = runExCommand(state, 'let g:delRes = matchdelete(4)');
    expect(evalVimExpression(state, 'g:delRes').value).toBe(0);
    expect(state.customMatches).toBeUndefined();

    // 없는 ID 삭제 시 -1
    expect(evalVimExpression(state, 'matchdelete(999)').value).toBe(-1);
  });
});
