import { describe, it, expect, beforeEach } from 'vitest';
import { AntiPatternDetector } from './antiPatternDetector';

describe('AntiPatternDetector utility', () => {
  let detector: AntiPatternDetector;

  beforeEach(() => {
    detector = new AntiPatternDetector();
  });

  it('detects repeated motions after 5 consecutive presses', () => {
    expect(detector.processKey('h', 'NORMAL')).toBeNull();
    expect(detector.processKey('h', 'NORMAL')).toBeNull();
    expect(detector.processKey('h', 'NORMAL')).toBeNull();
    expect(detector.processKey('h', 'NORMAL')).toBeNull();
    const msg = detector.processKey('h', 'NORMAL');
    expect(msg).toBe('이동 키를 연타하는 대신 w, b 또는 숫자+이동(예: 5j)을 사용해 보세요!');
  });

  it('detects 4 consecutive Backspaces in INSERT mode', () => {
    expect(detector.processKey('Backspace', 'INSERT')).toBeNull();
    expect(detector.processKey('Backspace', 'INSERT')).toBeNull();
    expect(detector.processKey('Backspace', 'INSERT')).toBeNull();
    const msg = detector.processKey('Backspace', 'INSERT');
    expect(msg).toBe('Normal 모드에서 x, dw, 또는 ciw로 지우면 훨씬 빠릅니다!');
  });

  it('detects $ followed by a in NORMAL mode', () => {
    detector.processKey('$', 'NORMAL');
    const msg = detector.processKey('a', 'NORMAL');
    expect(msg).toBe('A 키 하나로 줄 끝 이동과 입력 모드 진입을 한 번에 할 수 있습니다!');
  });

  it('detects 0 or ^ followed by i in NORMAL mode', () => {
    detector.processKey('0', 'NORMAL');
    let msg = detector.processKey('i', 'NORMAL');
    expect(msg).toBe('I 키 하나로 줄 첫 글자 앞에서 바로 입력 모드로 들어갈 수 있습니다!');

    detector.reset();
    detector.processKey('^', 'NORMAL');
    msg = detector.processKey('i', 'NORMAL');
    expect(msg).toBe('I 키 하나로 줄 첫 글자 앞에서 바로 입력 모드로 들어갈 수 있습니다!');
  });

  it('detects d$ and c$ in NORMAL mode', () => {
    let msg = detector.processKey('$', 'NORMAL', 'd');
    expect(msg).toBe('대문자 D 또는 C를 누르면 한 타수로 줄 끝까지 삭제/변경됩니다!');

    msg = detector.processKey('$', 'NORMAL', 'c');
    expect(msg).toBe('대문자 D 또는 C를 누르면 한 타수로 줄 끝까지 삭제/변경됩니다!');
  });

  it('detects x repeated 3 times', () => {
    expect(detector.processKey('x', 'NORMAL')).toBeNull();
    expect(detector.processKey('x', 'NORMAL')).toBeNull();
    const msg = detector.processKey('x', 'NORMAL');
    expect(msg).toBe('숫자 카운트(3dd, 5x)나 비주얼 라인(V + 이동 + d)을 활용해 보세요!');
  });

  it('detects dd repeated 3 times', () => {
    // 1st dd
    detector.processKey('d', 'NORMAL');
    detector.processKey('d', 'NORMAL', 'd');

    // 2nd dd
    detector.processKey('d', 'NORMAL');
    detector.processKey('d', 'NORMAL', 'd');

    // 3rd dd
    detector.processKey('d', 'NORMAL');
    const msg = detector.processKey('d', 'NORMAL', 'd');
    expect(msg).toBe('숫자 카운트(3dd, 5x)나 비주얼 라인(V + 이동 + d)을 활용해 보세요!');
  });
});
