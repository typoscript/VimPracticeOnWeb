import { describe, it, expect } from 'vitest';
import { evaluateVimExpression } from './expressionParser';

describe('Safe Vim Expression Parser (Ctrl+r =)', () => {
  it('기본 사칙연산(덧셈, 뺄셈, 곱셈, 나눗셈, 괄호)을 정확하게 계산한다', () => {
    expect(evaluateVimExpression('1024 * 64')).toEqual({ success: true, result: '65536' });
    expect(evaluateVimExpression('24 * 60 * 60')).toEqual({ success: true, result: '86400' });
    expect(evaluateVimExpression('(10 + 5) * 2')).toEqual({ success: true, result: '30' });
    expect(evaluateVimExpression('100 - 35')).toEqual({ success: true, result: '65' });
    expect(evaluateVimExpression('50 / 2')).toEqual({ success: true, result: '25' });
    expect(evaluateVimExpression('7 / 2')).toEqual({ success: true, result: '3.5' });
    expect(evaluateVimExpression('10 % 3')).toEqual({ success: true, result: '1' });
  });

  it('거듭제곱(** 및 ^)과 단항 연산자(-, +)를 지원한다', () => {
    expect(evaluateVimExpression('2 ** 8')).toEqual({ success: true, result: '256' });
    expect(evaluateVimExpression('2 ^ 10')).toEqual({ success: true, result: '1024' });
    expect(evaluateVimExpression('-5 * 10')).toEqual({ success: true, result: '-50' });
    expect(evaluateVimExpression('+123')).toEqual({ success: true, result: '123' });
  });

  it('16진수(0xff), 2진수(0b1010), 8진수(0o77) 진수 리터럴을 지원한다', () => {
    expect(evaluateVimExpression('0xff')).toEqual({ success: true, result: '255' });
    expect(evaluateVimExpression('0xFF + 1')).toEqual({ success: true, result: '256' });
    expect(evaluateVimExpression('0b1010')).toEqual({ success: true, result: '10' });
    expect(evaluateVimExpression('0o77')).toEqual({ success: true, result: '63' });
  });

  it('문자열 길이 함수(len, strlen) 및 수학 함수(abs, round, floor, ceil, sqrt, min, max)를 지원한다', () => {
    expect(evaluateVimExpression('len("hello")')).toEqual({ success: true, result: '5' });
    expect(evaluateVimExpression("strlen('world!')")).toEqual({ success: true, result: '6' });
    expect(evaluateVimExpression('abs(-42)')).toEqual({ success: true, result: '42' });
    expect(evaluateVimExpression('round(3.7)')).toEqual({ success: true, result: '4' });
    expect(evaluateVimExpression('floor(3.9)')).toEqual({ success: true, result: '3' });
    expect(evaluateVimExpression('ceil(3.1)')).toEqual({ success: true, result: '4' });
    expect(evaluateVimExpression('sqrt(49)')).toEqual({ success: true, result: '7' });
    expect(evaluateVimExpression('min(10, 5, 20)')).toEqual({ success: true, result: '5' });
    expect(evaluateVimExpression('max(10, 5, 20)')).toEqual({ success: true, result: '20' });
  });

  it('문자열 연결 연산자(.) 및 (+)를 지원한다', () => {
    expect(evaluateVimExpression('"Hello " . "Vim"')).toEqual({ success: true, result: 'Hello Vim' });
    expect(evaluateVimExpression('"Count: " + 42')).toEqual({ success: true, result: 'Count: 42' });
  });

  it('0으로 나누거나 잘못된 문법일 때 eval 호출 없이 안전하게 에러를 반환한다', () => {
    const divZero = evaluateVimExpression('10 / 0');
    expect(divZero.success).toBe(false);
    expect(divZero.error).toContain('0으로 나눌 수 없습니다');

    const unclosedParen = evaluateVimExpression('(10 + 20');
    expect(unclosedParen.success).toBe(false);

    const empty = evaluateVimExpression('');
    expect(empty.success).toBe(false);

    const unknownFunc = evaluateVimExpression('unknownFunc(10)');
    expect(unknownFunc.success).toBe(false);
    expect(unknownFunc.error).toContain('지원하지 않는 내장 함수');
  });
});
