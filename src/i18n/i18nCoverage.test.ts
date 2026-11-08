import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EN } from './en';
import { EN_CONTENT } from './enContent';
import { MISSIONS } from '../data/missions';
import { DUNGEON_STAGES, DUNGEON_SKILLS } from '../data/dungeonStages';
import { SANDBOX_INITIAL_LINES } from '../data/sandbox';
import { t, localized, setLocale, getLocale } from './index';

/**
 * 영어 사전(en.ts)이 화면 문구를 빠짐없이 덮는지 검사합니다.
 * - 앱·컴포넌트·utils 의 t('…')·i18nKey('…') 첫 인자와 localized(…) 안의 한국어 문자열은 모두 EN 에 있어야 합니다.
 * - 자리표시자 {이름} 은 원문과 번역이 같아야 합니다.
 * - 소스에서 더는 쓰지 않는 EN 키는 남기지 않습니다.
 * - 레슨·던전·자유 연습장 본문(화면에서 t(mission.title) 처럼 번역)은 EN_CONTENT 에 있어야 합니다.
 */

const SRC_DIR = path.resolve(__dirname, '..');
const HANGUL = /[가-힣]/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

function uiSourceFiles(): string[] {
  return [path.join(SRC_DIR, 'App.tsx'), ...walk(path.join(SRC_DIR, 'components')), ...walk(path.join(SRC_DIR, 'utils'))];
}

function unescapeLiteral(body: string): string {
  return body.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
}

const STRING_LITERAL = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"/g;

/** localized( 부터 짝이 맞는 ) 까지의 범위 (문자열 안의 괄호는 무시) */
function localizedSpans(source: string): string[] {
  const spans: string[] = [];
  const re = /\blocalized\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === "'" || c === '"' || c === '`') {
        i++;
        while (i < source.length && source[i] !== c) i += source[i] === '\\' ? 2 : 1;
      } else if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    spans.push(source.slice(m.index, i));
  }
  return spans;
}

function collectKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of uiSourceFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    const rel = path.relative(SRC_DIR, file);
    const tCall = /(?<![\w$.])(?:t|i18nKey)\(\s*(?:'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)")/g;
    let m: RegExpExecArray | null;
    while ((m = tCall.exec(source)) !== null) keys.set(unescapeLiteral(m[1] ?? m[2]), rel);
    for (const span of localizedSpans(source)) {
      for (const s of span.matchAll(STRING_LITERAL)) {
        const text = unescapeLiteral(s[1] ?? s[2]);
        if (HANGUL.test(text)) keys.set(text, rel);
      }
    }
  }
  return keys;
}

// Vim 도움말 표기 f{문자} 는 자리표시자가 아니며 영어로는 f{char} 로 씁니다.
/** 화면에서 t() 로 번역하는 데이터 본문 */
function contentKeys(): Set<string> {
  const keys = new Set<string>();
  const add = (s: string | undefined) => {
    if (s && HANGUL.test(s)) keys.add(s);
  };
  for (const m of MISSIONS) [m.title, m.description, m.hint].forEach(add);
  for (const s of DUNGEON_STAGES) [s.title, s.description, s.hint, s.objective].forEach(add);
  for (const k of Object.values(DUNGEON_SKILLS)) [k.name, k.description].forEach(add);
  SANDBOX_INITIAL_LINES.forEach(add);
  return keys;
}

const placeholders = (s: string) =>
  [...s.replace(/\{문자\}/g, '{char}').matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]).sort();

describe('i18n coverage', () => {
  afterEach(() => setLocale('ko', { persist: false }));

  const keys = collectKeys();

  it('finds the UI strings', () => {
    expect(keys.size).toBeGreaterThan(500);
  });

  it('has an English translation for every UI string', () => {
    const missing = [...keys].filter(([ko]) => !(ko in EN)).map(([ko, file]) => `${file}: ${ko}`);
    expect(missing).toEqual([]);
  });

  const content = contentKeys();

  it('has an English translation for every lesson, dungeon and sandbox text', () => {
    expect(content.size).toBeGreaterThan(200);
    expect([...content].filter((ko) => !(ko in EN_CONTENT))).toEqual([]);
    expect(Object.keys(EN_CONTENT).filter((ko) => !content.has(ko))).toEqual([]);
  });

  it('keeps the same placeholders in every translation', () => {
    const mismatched = Object.entries({ ...EN, ...EN_CONTENT })
      .filter(([ko, en]) => placeholders(ko).join() !== placeholders(en).join())
      .map(([ko, en]) => `${ko} → ${en}`);
    expect(mismatched).toEqual([]);
  });

  it('has no Hangul in the English text', () => {
    expect([...Object.values(EN), ...Object.values(EN_CONTENT)].filter((en) => HANGUL.test(en))).toEqual([]);
  });

  it('has no stale keys', () => {
    expect(Object.keys(EN).filter((ko) => !keys.has(ko))).toEqual([]);
  });

  it('switches t() and localized() with the locale', () => {
    const labels = localized({ close: '닫기', nested: { list: ['취소'] }, count: 3 });
    expect(getLocale()).toBe('ko');
    expect(t('닫기')).toBe('닫기');
    expect(labels.close).toBe('닫기');
    setLocale('en', { persist: false });
    expect(t('닫기')).toBe('Close');
    expect(labels.close).toBe('Close');
    expect(labels.nested.list[0]).toBe('Cancel');
    expect(labels.count).toBe(3);
    expect(t('{n}타', { n: 7 })).toBe('7 keys');
    expect(t('번역 없는 문구')).toBe('번역 없는 문구');
    expect(t(MISSIONS[0].title)).toBe('Lesson 1: Basic Movement (h, j, k, l)');
  });
});
