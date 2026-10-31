import { describe, it, expect } from 'vitest';
import { normalizeImeKey } from './imeHelper';

describe('imeHelper module', () => {
  it('NORMAL 모드에서 한글 자모가 입력되면 물리 코드(code)에 매칭되는 영문 키로 정규화한다', () => {
    // 이동키 ㅗ, ㅓ, ㅏ, ㅣ -> h, j, k, l
    expect(normalizeImeKey({ key: 'ㅗ', code: 'KeyH' }, 'NORMAL')).toEqual({
      key: 'h',
      isNormalized: true,
    });
    expect(normalizeImeKey({ key: 'ㅓ', code: 'KeyJ' }, 'NORMAL')).toEqual({
      key: 'j',
      isNormalized: true,
    });
    expect(normalizeImeKey({ key: 'ㅏ', code: 'KeyK' }, 'NORMAL')).toEqual({
      key: 'k',
      isNormalized: true,
    });
    expect(normalizeImeKey({ key: 'ㅣ', code: 'KeyL' }, 'NORMAL')).toEqual({
      key: 'l',
      isNormalized: true,
    });

    // 편집키 ㅇ -> d, ㅈ -> w, ㅌ -> x
    expect(normalizeImeKey({ key: 'ㅇ', code: 'KeyD' }, 'NORMAL')).toEqual({
      key: 'd',
      isNormalized: true,
    });
    expect(normalizeImeKey({ key: 'ㅈ', code: 'KeyW' }, 'NORMAL')).toEqual({
      key: 'w',
      isNormalized: true,
    });
    expect(normalizeImeKey({ key: 'ㅌ', code: 'KeyX' }, 'NORMAL')).toEqual({
      key: 'x',
      isNormalized: true,
    });
  });

  it('Shift 키가 눌린 경우 대문자로 정규화한다', () => {
    expect(normalizeImeKey({ key: 'ㅗ', code: 'KeyH', shiftKey: true }, 'NORMAL')).toEqual({
      key: 'H',
      isNormalized: true,
    });
    expect(normalizeImeKey({ key: 'ㅓ', code: 'KeyJ', shiftKey: true }, 'NORMAL')).toEqual({
      key: 'J',
      isNormalized: true,
    });
  });

  it('한글 상태에서 슬래시와 콜론 물리 키를 정규화한다', () => {
    expect(normalizeImeKey({ key: 'Process', code: 'Slash' }, 'NORMAL')).toEqual({
      key: '/',
      isNormalized: true,
    });
    expect(normalizeImeKey({ key: 'Process', code: 'Semicolon', shiftKey: true }, 'NORMAL')).toEqual({
      key: ':',
      isNormalized: true,
    });
  });

  it('INSERT 모드에서는 한글 입력을 유지하며 정규화하지 않는다', () => {
    expect(normalizeImeKey({ key: '안', code: 'KeyD' }, 'INSERT')).toEqual({
      key: '안',
      isNormalized: false,
    });
  });

  it('영문 키는 정규화 플래그 false로 그대로 반환한다', () => {
    expect(normalizeImeKey({ key: 'h', code: 'KeyH' }, 'NORMAL')).toEqual({
      key: 'h',
      isNormalized: false,
    });
  });
});
