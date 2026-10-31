import { VimMode } from '../types/vim';

export interface ImeNormalizationResult {
  /** 정규화된 키 문자 (또는 원본 키) */
  key: string;
  /** 한글(IME) 입력 상태에서 물리 키 코드로 자동 매핑되었는지 여부 */
  isNormalized: boolean;
}

/**
 * 한글(두벌식) 또는 IME 입력 상태에서 NORMAL/VISUAL/COMMAND 모드 키 입력을
 * 키보드 물리 코드(KeyboardEvent.code)를 기반으로 영문 Vim 명령어로 자동 매핑합니다.
 */
export function normalizeImeKey(
  e: { key: string; code?: string; shiftKey?: boolean },
  mode: VimMode
): ImeNormalizationResult {
  // INSERT 모드에서는 텍스트 타이핑을 위해 한글 입력을 그대로 보존
  if (mode === 'INSERT') {
    return { key: e.key, isNormalized: false };
  }

  // 한글 자모 또는 Process 이벤트 감지
  const isKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(e.key) || e.key === 'Process';
  if (!isKorean || !e.code) {
    return { key: e.key, isNormalized: false };
  }

  // 1. 알파벳 키 (KeyA ~ KeyZ): h, j, k, l, w, b, x, d, c, r, i 등
  if (e.code.startsWith('Key')) {
    const rawLetter = e.code.slice(3).toLowerCase();
    const finalKey = e.shiftKey ? rawLetter.toUpperCase() : rawLetter;
    return { key: finalKey, isNormalized: true };
  }

  // 2. 슬래시(/) 및 물음표(?)
  if (e.code === 'Slash') {
    return { key: e.shiftKey ? '?' : '/', isNormalized: true };
  }

  // 3. 세미콜론(;) 및 콜론(:)
  if (e.code === 'Semicolon') {
    return { key: e.shiftKey ? ':' : ';', isNormalized: true };
  }

  // 4. 숫자 및 상단 기호
  if (e.code === 'Digit0') {
    return { key: e.shiftKey ? ')' : '0', isNormalized: true };
  }
  if (e.code === 'Digit4' && e.shiftKey) {
    return { key: '$', isNormalized: true };
  }
  if (e.code === 'Digit6' && e.shiftKey) {
    return { key: '^', isNormalized: true };
  }
  if (e.code === 'Period') {
    return { key: e.shiftKey ? '>' : '.', isNormalized: true };
  }

  return { key: e.key, isNormalized: false };
}
