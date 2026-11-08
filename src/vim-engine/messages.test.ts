import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EN_MESSAGES } from './messagesEn';
import { msg } from './messages';
import { configureVimEngine, createVimState, runExCommand, sendKeys } from './index';

/**
 * 엔진 메시지 영어 사전(messagesEn.ts)이 msg('…') 원문을 빠짐없이 덮고,
 * locale: 'en' 일 때 실제 Vim 처럼 영어 메시지가 나오는지 검사합니다.
 */

const HANGUL = /[가-힣]/;

function messageKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of fs.readdirSync(__dirname)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const m of source.matchAll(/(?<![\w$.])msg\(\s*'((?:\\.|[^'\\\n])*)'/g)) {
      keys.add(m[1].replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c)));
    }
  }
  return keys;
}

const placeholders = (s: string) => [...s.matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]).sort();

describe('engine messages', () => {
  afterEach(() => configureVimEngine({ locale: 'ko' }));

  const keys = messageKeys();

  it('has an English message for every msg() call and no stale entries', () => {
    expect(keys.size).toBeGreaterThan(200);
    expect([...keys].filter((ko) => !(ko in EN_MESSAGES))).toEqual([]);
    expect(Object.keys(EN_MESSAGES).filter((ko) => !keys.has(ko))).toEqual([]);
  });

  it('keeps placeholders and the E-number of every message', () => {
    const bad = Object.entries(EN_MESSAGES).filter(
      ([ko, en]) =>
        placeholders(ko).join() !== placeholders(en).join() ||
        (ko.match(/^E\d+:/)?.[0] ?? '') !== (en.match(/^E\d+:/)?.[0] ?? '') ||
        HANGUL.test(en),
    );
    expect(bad).toEqual([]);
  });

  it('uses Korean by default and English with locale: en', () => {
    expect(msg('E486: 패턴을 찾을 수 없습니다: {pat}', { pat: 'foo' })).toBe('E486: 패턴을 찾을 수 없습니다: foo');
    configureVimEngine({ locale: 'en' });
    expect(msg('E486: 패턴을 찾을 수 없습니다: {pat}', { pat: 'foo' })).toBe('E486: Pattern not found: foo');
  });

  it('reports real Vim English errors from commands', () => {
    configureVimEngine({ locale: 'en' });
    const state = createVimState(['one', 'two', 'three']);
    expect(runExCommand(state, 'Foo').commandMessage).toBe('E492: Not an editor command: Foo');
    expect(sendKeys(state, '/zzz<CR>').commandMessage).toBe('E486: Pattern not found: zzz');
    expect(runExCommand(state, '1,2d').commandMessage).toBe('2 fewer lines');
    expect(runExCommand(state, '%s/o/0/g').commandMessage).toBe('2 substitutions');
  });
});
