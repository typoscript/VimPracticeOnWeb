import { VimMode } from '../vim-engine';

export const REPEATED_MOTION_KEYS = [
  'h', 'j', 'k', 'l',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
];

/**
 * Vim 사용 중 비효율적인 조작 습관(안티패턴)을 실시간 감지하여
 * 더 효율적인 Vim 명령어를 추천하는 분석기
 */
export class AntiPatternDetector {
  private motionCount = 0;
  private backspaceCount = 0;
  private xCount = 0;
  private ddCount = 0;
  private lastNormalKey: string | null = null;

  /**
   * 키 입력을 받아 안티패턴이 감지되면 사용자 코칭 메시지를 반환합니다.
   *
   * @param key 현재 입력된 키
   * @param currentMode 키 입력 당시의 VimMode
   * @param pendingKeys 다중 키 버퍼 (예: 'd', 'c')
   */
  public processKey(
    key: string,
    currentMode: VimMode,
    pendingKeys?: string
  ): string | null {
    let coachingMsg: string | null = null;

    // 1. i 진입 후 Backspace 4회 이상 연타
    if (currentMode === 'INSERT') {
      if (key === 'Backspace') {
        this.backspaceCount += 1;
        if (this.backspaceCount >= 4) {
          coachingMsg = 'Normal 모드에서 x, dw, 또는 ciw로 지우면 훨씬 빠릅니다!';
        }
      } else {
        this.backspaceCount = 0;
      }
    } else {
      this.backspaceCount = 0;
    }

    // 2. NORMAL 모드 안티패턴 검사
    if (currentMode === 'NORMAL') {
      // 2-1. 이동 키 5회 이상 연속 연타
      if (REPEATED_MOTION_KEYS.includes(key)) {
        this.motionCount += 1;
        if (this.motionCount >= 5) {
          coachingMsg = '이동 키를 연타하는 대신 w, b 또는 숫자+이동(예: 5j)을 사용해 보세요!';
        }
      } else {
        this.motionCount = 0;
      }

      // 2-2. $ 이동 직후 a 입력
      if (this.lastNormalKey === '$' && key === 'a') {
        coachingMsg = 'A 키 하나로 줄 끝 이동과 입력 모드 진입을 한 번에 할 수 있습니다!';
      }

      // 2-3. 0 또는 ^ 이동 직후 i 입력
      if ((this.lastNormalKey === '0' || this.lastNormalKey === '^') && key === 'i') {
        coachingMsg = 'I 키 하나로 줄 첫 글자 앞에서 바로 입력 모드로 들어갈 수 있습니다!';
      }

      // 2-4. d$ 또는 c$ 입력
      if ((pendingKeys === 'd' || pendingKeys === 'c') && key === '$') {
        coachingMsg = '대문자 D 또는 C를 누르면 한 타수로 줄 끝까지 삭제/변경됩니다!';
      }

      // 2-5. x 3회 이상 연속 반복
      if (key === 'x') {
        this.xCount += 1;
        if (this.xCount >= 3) {
          coachingMsg = '숫자 카운트(3dd, 5x)나 비주얼 라인(V + 이동 + d)을 활용해 보세요!';
        }
      } else {
        this.xCount = 0;
      }

      // 2-6. dd 3회 이상 연속 반복
      if (pendingKeys === 'd' && key === 'd') {
        this.ddCount += 1;
        if (this.ddCount >= 3) {
          coachingMsg = '숫자 카운트(3dd, 5x)나 비주얼 라인(V + 이동 + d)을 활용해 보세요!';
        }
      } else if (pendingKeys !== 'd' && key !== 'd') {
        this.ddCount = 0;
      }

      this.lastNormalKey = key;
    } else {
      this.motionCount = 0;
      this.xCount = 0;
      this.ddCount = 0;
      this.lastNormalKey = null;
    }

    return coachingMsg;
  }

  public reset(): void {
    this.motionCount = 0;
    this.backspaceCount = 0;
    this.xCount = 0;
    this.ddCount = 0;
    this.lastNormalKey = null;
  }
}
