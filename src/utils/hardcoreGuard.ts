export interface HardcoreCheckResult {
  blocked: boolean;
  reason?: 'arrow' | 'mouse' | 'spam';
  message?: string;
  suggestion?: string;
}

export const HARDCORE_SPAM_KEYS = new Set(['h', 'j', 'k', 'l', 'x', 'Backspace', 'BackSpace']);

export const SPAM_SUGGESTIONS: Record<string, string> = {
  h: 'b, 0, 또는 F{문자}를 사용하세요',
  j: '5j, }, 또는 /검색을 사용하세요',
  k: '5k, {, 또는 ?검색을 사용하세요',
  l: 'w, $, 또는 f{문자}를 사용하세요',
  x: 'dw, d$, 또는 d{motion}을 사용하세요',
  Backspace: 'dw, cw, 또는 d{motion}을 사용하세요',
  BackSpace: 'dw, cw, 또는 d{motion}을 사용하세요',
};

export class HardcoreGuard {
  private lastKey: string | null = null;
  private keyTimestamps: number[] = [];
  public static readonly WINDOW_MS = 1500;
  public static readonly MAX_ALLOWED_REPEATS = 3;

  /**
   * 키 입력이 하드코어 룰에 의해 차단되어야 하는지 검사합니다.
   */
  public checkKey(key: string, now: number = Date.now()): HardcoreCheckResult {
    // 1. 방향키 완전 차단
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      return {
        blocked: true,
        reason: 'arrow',
        message: '🚫 하드코어 모드: 방향키 대신 hjkl 또는 w/b를 사용하세요!',
        suggestion: 'hjkl 또는 w, b, e 이동 모션을 연습해 보세요.',
      };
    }

    // 2. 연타 쿨타임 제한 (Hardtime 규칙)
    if (HARDCORE_SPAM_KEYS.has(key)) {
      if (this.lastKey === key) {
        // 동일한 키 연속 입력: 1.5초(WINDOW_MS) 윈도우 내의 타임스탬프만 유지
        this.keyTimestamps = this.keyTimestamps.filter(t => now - t <= HardcoreGuard.WINDOW_MS);
        this.keyTimestamps.push(now);

        if (this.keyTimestamps.length > HardcoreGuard.MAX_ALLOWED_REPEATS) {
          const suggestion = SPAM_SUGGESTIONS[key] || '효율적인 모션을 사용하세요';
          return {
            blocked: true,
            reason: 'spam',
            message: `🚫 연타 금지! '${key}' 연타는 좋은 습관이 아닙니다.`,
            suggestion,
          };
        }
      } else {
        // 다른 키로 전환되면 카운트 리셋
        this.lastKey = key;
        this.keyTimestamps = [now];
      }
    } else {
      // 스팸 감시 대상이 아닌 키를 누르면 연타 스트릭 리셋
      this.lastKey = null;
      this.keyTimestamps = [];
    }

    return { blocked: false };
  }

  /**
   * 에디터 내 마우스 클릭 차단
   */
  public checkMouseClick(): HardcoreCheckResult {
    return {
      blocked: true,
      reason: 'mouse',
      message: '🚫 하드코어 모드: 마우스 대신 Vim 모션(hjkl, w, f)을 사용하세요!',
      suggestion: '마우스를 멀리하고 키보드 모션만으로 커서를 이동해 보세요.',
    };
  }

  /**
   * 상태 초기화
   */
  public reset(): void {
    this.lastKey = null;
    this.keyTimestamps = [];
  }
}

export const globalHardcoreGuard = new HardcoreGuard();
