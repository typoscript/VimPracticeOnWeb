import { describe, it, expect } from 'vitest';
import { createVimState, sendKeys, handleKey } from './index';
import { parsePending } from './engineHelpers';
import {
  handleVisualZPrefix,
  handleVisualGImmediate,
  handleVisualGSubcommand,
  handleVisualDirectGCombo,
  handleVisualTextObject,
  handleVisualBracketPrefix,
} from './visualPrefixes';
import { modifyNumberAtCursor, modifyNumberVisual } from './numberOperators';
import { utf8ByteLength, executeGCtrlG, replaceVisualChars } from './visualUtilities';
import { getTagTextObjectRange } from './tagTextObject';

describe('visualPrefixes submodule', () => {
  it('handleVisualZPrefix: sets pending z, handles horizontal viewport keys and zf manual fold', () => {
    const nowrapState = sendKeys(
      createVimState(
        ['  line0 with very long content extending beyond screen width '.repeat(3), '  line1', '  line2'],
        { line: 0, col: 2 }
      ),
      ':set nowrap<CR>'
    );
    const base = {
      ...nowrapState,
      mode: 'VISUAL' as const,
      visualAnchor: { line: 0, col: 0 },
    };

    const waitZ = handleVisualZPrefix(base, 'z');
    expect(waitZ?.pendingKeys).toBe('z');

    const ignored = handleVisualZPrefix(base, 'x');
    expect(ignored).toBeNull();

    const scrolled = handleVisualZPrefix(waitZ!, 'l', 5);
    expect(scrolled).not.toBeNull();
    expect(scrolled?.pendingKeys).toBeUndefined();
    expect(scrolled?.viewport?.leftCol).toBe(5);

    const visualTwoLines = {
      ...waitZ!,
      cursor: { line: 1, col: 4 },
    };
    const folded = handleVisualZPrefix(visualTwoLines, 'f');
    expect(folded?.mode).toBe('NORMAL');
    expect(folded?.visualAnchor).toBeUndefined();
    expect(folded?.folds?.length).toBeGreaterThan(0);

    const cleared = handleVisualZPrefix(waitZ!, '?');
    expect(cleared?.pendingKeys).toBeUndefined();
    expect(cleared?.mode).toBe('VISUAL');
  });

  it('handleVisualGImmediate: handles gn, gt/gT, gj/gk, and g0/g$/gm/gM', () => {
    const base = createVimState(['first foo line', 'second line', 'third line'], { line: 0, col: 0 });
    expect(handleVisualGImmediate(base, 'n', parsePending(undefined))).toBeNull();

    const inVisualG = {
      ...base,
      mode: 'VISUAL' as const,
      visualAnchor: { line: 0, col: 0 },
      pendingKeys: 'g',
      lastSearchQuery: 'foo',
    };

    const gnRes = handleVisualGImmediate(inVisualG, 'n', parsePending('g'));
    expect(gnRes).not.toBeNull();
    expect(
      gnRes?.lines[0].slice(
        Math.min(gnRes.visualAnchor!.col, gnRes.cursor.col),
        Math.max(gnRes.visualAnchor!.col, gnRes.cursor.col) + 1
      )
    ).toBe('first foo');

    const gjRes = handleVisualGImmediate(inVisualG, 'j', parsePending('g'));
    expect(gjRes?.cursor.line).toBe(1);
    expect(gjRes?.pendingKeys).toBeUndefined();

    const gkAtTop = handleVisualGImmediate(inVisualG, 'k', parsePending('g'));
    expect(gkAtTop?.bell).toBe(true);

    const gDollar = handleVisualGImmediate(inVisualG, '$', parsePending('g'));
    expect(gDollar?.cursor.col).toBe(base.lines[0].length - 1);

    const withTwoTabs = {
      ...sendKeys(createVimState(['first foo line']), ':tabnew<CR>'),
      mode: 'VISUAL' as const,
      visualAnchor: { line: 0, col: 0 },
      pendingKeys: 'g',
    };
    const prevTabRes = handleVisualGImmediate(withTwoTabs, 'T', parsePending('g'));
    expect(prevTabRes?.currentTabId).toBe(1);
    expect(prevTabRes?.pendingKeys).toBeUndefined();

    const nextTabRes = handleVisualGImmediate({ ...prevTabRes!, pendingKeys: 'g' }, 't', parsePending('g'));
    expect(nextTabRes?.currentTabId).toBe(2);
    expect(nextTabRes?.pendingKeys).toBeUndefined();
  });

  it('handleVisualGSubcommand & handleVisualDirectGCombo: handles gg, g?, gc, gJ, g<C-a>, and count precedence', () => {
    const base = {
      ...createVimState(['item 10', 'item 20', 'item 30'], { line: 2, col: 0 }),
      mode: 'VISUAL_LINE' as const,
      visualAnchor: { line: 0, col: 0 },
      pendingKeys: 'g',
    };

    expect(handleVisualGSubcommand(createVimState(['a']), 'g', parsePending(undefined))).toBeNull();

    const ggTop = handleVisualGSubcommand(base, 'g', parsePending('g'));
    expect(ggTop?.cursor.line).toBe(0);

    const ggCount = handleVisualGSubcommand({ ...base, pendingKeys: '2g' }, 'g', parsePending('2g'));
    expect(ggCount?.cursor.line).toBe(1);

    const rot13 = handleVisualGSubcommand(
      { ...createVimState(['abc'], { line: 0, col: 2 }), mode: 'VISUAL', visualAnchor: { line: 0, col: 0 }, pendingKeys: 'g' },
      '?',
      parsePending('g')
    );
    expect(rot13?.lines[0]).toBe('nop');
    expect(rot13?.mode).toBe('NORMAL');

    const gJ = handleVisualGSubcommand(base, 'J', parsePending('g'));
    expect(gJ?.lines).toEqual(['item 10item 20item 30']);
    expect(gJ?.lastChangeKeys).toEqual(['3', 'g', 'J']); // 3줄을 합쳤으므로 . 반복도 3gJ

    const gCtrlA = handleVisualDirectGCombo(base, 'g<Ctrl-a>', 1);
    expect(gCtrlA?.lines).toEqual(['item 11', 'item 22', 'item 33']);
    expect(handleVisualDirectGCombo(base, 'unknown', 1)).toBeNull();

    // handleKey integration: visual 'v' -> 'g' -> 'j' vs '2' -> 'g' -> 'g'
    let st = createVimState(['line 0', 'line 1', 'line 2'], { line: 0, col: 0 });
    st = sendKeys(st, 'v2j');
    expect(st.cursor.line).toBe(2);
    st = handleKey(st, 'g');
    st = handleKey(st, 'g');
    expect(st.cursor.line).toBe(0);
  });

  it('handleVisualTextObject & handleVisualBracketPrefix: selects text objects and unmatched brackets', () => {
    const base = {
      ...createVimState(['function f() {', '  const x = "hello";', '  const y = 1;', '}'], {
        line: 1,
        col: 14,
      }),
      mode: 'VISUAL' as const,
      visualAnchor: { line: 1, col: 14 },
    };

    const waitI = handleVisualTextObject(base, 'i');
    expect(waitI?.pendingKeys).toBe('i');
    expect(handleVisualTextObject(base, 'x')).toBeNull();

    const quoteSel = handleVisualTextObject(waitI!, '"');
    expect(quoteSel?.visualAnchor).toEqual({ line: 1, col: 13 });
    expect(quoteSel?.cursor).toEqual({ line: 1, col: 17 });

    const indentSel = handleVisualTextObject(waitI!, 'i');
    expect(indentSel?.mode).toBe('VISUAL_LINE');

    const invalidObj = handleVisualTextObject(waitI!, 'z');
    expect(invalidObj?.pendingKeys).toBeUndefined();

    const waitBracket = handleVisualBracketPrefix(base, '[');
    expect(waitBracket?.pendingKeys).toBe('[');
    const toBrace = handleVisualBracketPrefix(waitBracket!, '{');
    expect(toBrace?.cursor).toEqual({ line: 0, col: 13 });

    const badBracket = handleVisualBracketPrefix(waitBracket!, 'x');
    expect(badBracket?.pendingKeys).toBeUndefined();
  });
});

describe('numberOperators submodule', () => {
  it('modifyNumberAtCursor: handles decimal, negative, hex, bin, octal, alpha, unsigned, and bell', () => {
    const decState = createVimState(['val = -10'], { line: 0, col: 0 });
    expect(modifyNumberAtCursor(decState, 3).lines[0]).toBe('val = -7');

    const noNumState = createVimState(['plain text only'], { line: 0, col: 0 });
    const unchanged = modifyNumberAtCursor(noNumState, 1);
    expect(unchanged.lines).toEqual(['plain text only']);
    expect(unchanged.pendingKeys).toBeUndefined();

    const hexState = createVimState(['color 0x0F'], { line: 0, col: 0 });
    expect(modifyNumberAtCursor(hexState, 1).lines[0]).toBe('color 0x10');

    const binState = createVimState(['mask 0b0101'], { line: 0, col: 0 });
    expect(modifyNumberAtCursor(binState, 1).lines[0]).toBe('mask 0b0110');

    let octState = createVimState(['perm 07'], { line: 0, col: 0 });
    octState = sendKeys(octState, ':set nrformats=octal<CR>');
    expect(modifyNumberAtCursor(octState, 1).lines[0]).toBe('perm 010');

    let alphaState = createVimState(['item a and z'], { line: 0, col: 5 });
    alphaState = sendKeys(alphaState, ':set nrformats=alpha<CR>');
    expect(modifyNumberAtCursor(alphaState, 1).lines[0]).toBe('item b and z');

    let unsignedState = createVimState(['num -5'], { line: 0, col: 4 });
    unsignedState = sendKeys(unsignedState, ':set nrformats=unsigned<CR>');
    expect(modifyNumberAtCursor(unsignedState, 10).lines[0]).toBe('num -15');
  });

  it('modifyNumberVisual: handles VISUAL, VISUAL_LINE, VISUAL_BLOCK, sequential and non-sequential', () => {
    const noAnchor = modifyNumberVisual(createVimState(['1'], { line: 0, col: 0 }), true, false);
    expect(noAnchor.mode).toBe('NORMAL');

    const visualLine = {
      ...createVimState(['a = 10', 'b = 10', 'c = 10'], { line: 2, col: 0 }),
      mode: 'VISUAL_LINE' as const,
      visualAnchor: { line: 0, col: 0 },
    };
    expect(modifyNumberVisual(visualLine, true, false, 5).lines).toEqual(['a = 15', 'b = 15', 'c = 15']);
    expect(modifyNumberVisual(visualLine, true, true, 1).lines).toEqual(['a = 11', 'b = 12', 'c = 13']);

    const visualBlock = {
      ...createVimState(['10 99', '20 99'], { line: 1, col: 1 }),
      mode: 'VISUAL_BLOCK' as const,
      visualAnchor: { line: 0, col: 0 },
    };
    expect(modifyNumberVisual(visualBlock, false, true, 1).lines).toEqual(['9 99', '18 99']);

    const charVisual = {
      ...createVimState(['x=1', 'y=2'], { line: 1, col: 2 }),
      mode: 'VISUAL' as const,
      visualAnchor: { line: 0, col: 2 },
    };
    expect(modifyNumberVisual(charVisual, true, true, 2).lines).toEqual(['x=3', 'y=6']);
  });
});

describe('visualUtilities & tagTextObject submodules', () => {
  it('utf8ByteLength: calculates 1/2/3/4 byte UTF-8 sequences accurately', () => {
    expect(utf8ByteLength('abc')).toBe(3); // 1 byte each
    expect(utf8ByteLength('é')).toBe(2); // U+00E9 -> 2 bytes
    expect(utf8ByteLength('한')).toBe(3); // U+D55C -> 3 bytes
    expect(utf8ByteLength('🚀')).toBe(4); // surrogate pair -> 4 bytes
  });

  it('executeGCtrlG: formats position and selection stats for NORMAL, VISUAL, VISUAL_LINE, VISUAL_BLOCK', () => {
    const base = createVimState(['hello world', 'second line'], { line: 0, col: 6 });
    const normalRes = executeGCtrlG(base);
    expect(normalRes.commandMessage).toContain('열 7');
    expect(normalRes.commandMessage).toContain('줄 1 / 2');

    const visualRes = executeGCtrlG({
      ...base,
      mode: 'VISUAL',
      visualAnchor: { line: 0, col: 0 },
      cursor: { line: 0, col: 4 },
    });
    expect(visualRes.commandMessage).toContain('5 / 24바이트');

    const lineRes = executeGCtrlG({
      ...base,
      mode: 'VISUAL_LINE',
      visualAnchor: { line: 0, col: 0 },
      cursor: { line: 1, col: 0 },
    });
    expect(lineRes.commandMessage).toContain('2 / 2줄');

    const blockRes = executeGCtrlG({
      ...base,
      mode: 'VISUAL_BLOCK',
      visualAnchor: { line: 0, col: 0 },
      cursor: { line: 1, col: 3 },
      visualBlockEndOfLine: true,
    });
    expect(blockRes.commandMessage).toContain('11열');
  });

  it('replaceVisualChars: replaces selected characters across VISUAL modes and exits on missing anchor', () => {
    const noAnchor = replaceVisualChars(createVimState(['abc']), 'x');
    expect(noAnchor.mode).toBe('NORMAL');

    const vis = replaceVisualChars(
      {
        ...createVimState(['abcdef'], { line: 0, col: 3 }),
        mode: 'VISUAL',
        visualAnchor: { line: 0, col: 1 },
      },
      'Space'
    );
    expect(vis.lines[0]).toBe('a   ef');
    expect(vis.mode).toBe('NORMAL');

    const vLine = replaceVisualChars(
      {
        ...createVimState(['ab', 'cde'], { line: 1, col: 0 }),
        mode: 'VISUAL_LINE',
        visualAnchor: { line: 0, col: 0 },
      },
      '*'
    );
    expect(vLine.lines).toEqual(['**', '***']);

    const vBlock = replaceVisualChars(
      {
        ...createVimState(['1234', '56'], { line: 1, col: 1 }),
        mode: 'VISUAL_BLOCK',
        visualAnchor: { line: 0, col: 0 },
        visualBlockEndOfLine: true,
      },
      '#'
    );
    expect(vBlock.lines).toEqual(['####', '##']);
  });

  it('getTagTextObjectRange: resolves nested, multiline, upcoming, empty, and self-closing tags', () => {
    expect(getTagTextObjectRange([], { line: 0, col: 0 }, 'i')).toBeNull();
    expect(getTagTextObjectRange(['no tags here'], { line: 0, col: 0 }, 'a')).toBeNull();

    const nested = ['<div>', '  <span>hello</span>', '</div>'];
    expect(getTagTextObjectRange(nested, { line: 1, col: 9 }, 'i')).toEqual({
      startLine: 1,
      startCol: 8,
      endLine: 1,
      endCol: 12,
    });
    expect(getTagTextObjectRange(nested, { line: 1, col: 9 }, 'a')).toEqual({
      startLine: 1,
      startCol: 2,
      endLine: 1,
      endCol: 19,
    });

    // Cursor before tag falls forward to upcoming tag
    expect(getTagTextObjectRange(['prefix <b>bold</b>'], { line: 0, col: 0 }, 'i')).toEqual({
      startLine: 0,
      startCol: 10,
      endLine: 0,
      endCol: 13,
    });

    // Empty tag pair
    expect(getTagTextObjectRange(['<p></p>'], { line: 0, col: 1 }, 'i')).toMatchObject({
      isEmpty: true,
    });

    // Self-closing tag
    expect(getTagTextObjectRange(['<img src="a" />'], { line: 0, col: 2 }, 'a')).toEqual({
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: 14,
    });
    expect(getTagTextObjectRange(['<img src="a" />'], { line: 0, col: 2 }, 'i')).toMatchObject({
      isEmpty: true,
    });
  });
});
