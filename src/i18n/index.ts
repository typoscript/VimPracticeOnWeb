import { useSyncExternalStore } from 'react';
import { configureVimEngine } from '../vim-engine';

/**
 * 한/영 전환 (i18n)
 *
 * 한국어 원문 자체를 번역 키로 씁니다. t('레슨 목록') 은 한국어 모드에서는 그대로,
 * 영어 모드에서는 en.ts 사전의 번역('Lessons')을 돌려줍니다. 사전에 없으면 한국어 원문을 돌려줍니다.
 * 값이 들어가는 문장은 자리 표시를 씁니다: t('{n}개 항목', { n: 3 })
 *
 * 언어는 저장된 선택 → 브라우저 언어(ko 면 한국어, 그 외 영어) 순서로 정합니다.
 * Vim 엔진의 상태 표시줄 메시지 언어(configureVimEngine 의 locale)도 함께 맞춥니다.
 */

export type Locale = 'ko' | 'en';

export const LOCALE_STORAGE_KEY = 'vim_locale_v1';

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch {
    // 저장소를 쓸 수 없는 환경
  }
  const lang = typeof navigator !== 'undefined' ? navigator.language ?? '' : '';
  return /^ko\b/i.test(lang) ? 'ko' : 'en';
}

let currentLocale: Locale = detectLocale();
const listeners = new Set<() => void>();

let enDict: Record<string, string> = {};
let enContentDict: Record<string, string> = {};
let enLoaded = false;
let enLoadPromise: Promise<void> | null = null;

/** 테스트 환경 등에서 영어 사전을 동기로 미리 등록합니다. */
export function registerEnglishDictionaries(
  en: Record<string, string>,
  enContent: Record<string, string>
): void {
  enDict = en;
  enContentDict = enContent;
  enLoaded = true;
}

/** 영어 화면을 쓸 때만 en / enContent 청크를 동적으로 불러옵니다. */
export function ensureLocaleDictionaries(locale: Locale = currentLocale): Promise<void> {
  if (locale !== 'en' || enLoaded) {
    return Promise.resolve();
  }
  if (!enLoadPromise) {
    enLoadPromise = Promise.all([import('./en'), import('./enContent')])
      .then(([enMod, contentMod]) => {
        enDict = enMod.EN;
        enContentDict = contentMod.EN_CONTENT;
        enLoaded = true;
        listeners.forEach((fn) => fn());
      })
      .finally(() => {
        enLoadPromise = null;
      });
  }
  return enLoadPromise;
}

function applyLocale(locale: Locale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.title =
      locale === 'ko'
        ? 'VimPracticeOnWeb - 인터랙티브 Vim 튜토리얼 & 연습'
        : 'VimPracticeOnWeb - Interactive Vim Tutorial & Practice';
  }
  configureVimEngine({ locale });
}
applyLocale(currentLocale);

export function getLocale(): Locale {
  return currentLocale;
}

/** 언어를 바꿉니다. persist 가 false 면 저장하지 않습니다 (테스트용). */
export function setLocale(locale: Locale, options: { persist?: boolean } = {}): void {
  if (options.persist !== false) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // 저장소를 쓸 수 없는 환경
    }
  }
  if (locale === 'en' && !enLoaded) {
    void ensureLocaleDictionaries('en');
  }
  if (locale === currentLocale) return;
  currentLocale = locale;
  applyLocale(locale);
  listeners.forEach((fn) => fn());
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 현재 언어를 구독합니다. 언어가 바뀌면 이 훅을 쓰는 컴포넌트가 다시 그려집니다. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

/** 한국어 원문을 현재 언어로 바꿉니다. {name} 자리 표시는 params 로 채웁니다. */
export function t(ko: string, params?: Record<string, string | number | boolean | null | undefined>): string {
  const template = currentLocale === 'en' ? enDict[ko] ?? enContentDict[ko] ?? ko : ko;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole));
}

/**
 * 파일 최상위 상수(설명 표, 드릴 목록 등)를 현재 언어로 읽히게 합니다.
 * 값을 읽는 순간 문자열을 t() 로 번역하므로, 언어를 바꾼 뒤 다시 읽으면 바뀐 언어가 적용됩니다.
 *   const NAMES = localized({ w: '단어', b: '이전 단어' });  // NAMES.w → 'word' (영어 모드)
 */
/**
 * 저장용 키로 쓰는 한국어 원문을 표시합니다 (번역하지 않고 그대로 반환).
 * localStorage 등에 언어와 무관한 키를 남기고, 화면에서는 t(key) 로 번역합니다.
 * i18nCoverage.test.ts 가 이 원문도 사전에 있는지 검사합니다.
 */
export function i18nKey(ko: string): string {
  return ko;
}

export function localized<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  return new Proxy(value as unknown as object, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver);
      if (typeof v === 'string') return t(v);
      if (v !== null && typeof v === 'object') return localized(v);
      return v;
    },
  }) as T;
}
