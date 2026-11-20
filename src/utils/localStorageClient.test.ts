import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  STORAGE_KEYS,
  readStorageRaw,
  writeStorageRaw,
  removeStorageItem,
  readStorageBoolean,
  writeStorageBoolean,
  readStorageJson,
  writeStorageJson,
} from './localStorageClient';
import { BACKUP_KEYS } from './backupStorage';

describe('localStorageClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('raw 문자열 읽기·쓰기·삭제를 안전하게 수행한다', () => {
    expect(readStorageRaw('test_key')).toBeNull();
    expect(writeStorageRaw('test_key', 'hello')).toBe(true);
    expect(readStorageRaw('test_key')).toBe('hello');
    expect(removeStorageItem('test_key')).toBe(true);
    expect(readStorageRaw('test_key')).toBeNull();
  });

  it('boolean 설정 읽기·쓰기 및 기본값을 처리한다', () => {
    expect(readStorageBoolean('flag_a', true)).toBe(true);
    expect(readStorageBoolean('flag_a', false)).toBe(false);
    writeStorageBoolean('flag_a', true);
    expect(readStorageBoolean('flag_a', false)).toBe(true);
    writeStorageBoolean('flag_a', false);
    expect(readStorageBoolean('flag_a', true)).toBe(false);
  });

  it('JSON 객체 직렬화·역직렬화 및 손상된 JSON 폴백을 처리한다', () => {
    expect(readStorageJson('json_key', { count: 0 })).toEqual({ count: 0 });
    expect(writeStorageJson('json_key', { count: 42 })).toBe(true);
    expect(readStorageJson('json_key', { count: 0 })).toEqual({ count: 42 });

    localStorage.setItem('json_key', '{broken json');
    expect(readStorageJson('json_key', { count: -1 })).toEqual({ count: -1 });
  });

  it('localStorage 접근 예외 발생 시 throw 하지 않고 안전하게 폴백한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(readStorageRaw('k')).toBeNull();
    expect(readStorageBoolean('k', true)).toBe(true);
    expect(readStorageJson('k', { ok: false })).toEqual({ ok: false });
    expect(writeStorageRaw('k', 'v')).toBe(false);
    expect(writeStorageJson('k', { a: 1 })).toBe(false);
    expect(removeStorageItem('k')).toBe(false);
  });

  it('STORAGE_KEYS 의 모든 키가 중복 없이 BACKUP_KEYS 에 포함된다', () => {
    const allKeys = Object.values(STORAGE_KEYS);
    expect(new Set(allKeys).size).toBe(allKeys.length);
    const backupSet = new Set<string>(BACKUP_KEYS);
    for (const key of allKeys) {
      expect(backupSet.has(key), `missing from BACKUP_KEYS: ${key}`).toBe(true);
    }
  });
});
