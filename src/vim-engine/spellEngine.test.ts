import { describe, it, expect, beforeEach } from 'vitest';
import {
  createVimState,
  handleKey,
  sendKeys,
  runExCommand,
  configureVimEngine,
  isWordMisspelled,
  findSpellErrorsInLine,
  damerauLevenshtein,
  getSpellSuggestions,
} from './index';

describe('순정 Vim 맞춤법 검사기 엔진 (:set spell, ]s, [s, z=, zg, zw)', () => {
  beforeEach(() => {
    configureVimEngine({ locale: 'ko' });
  });

  describe(':set spell 옵션 제어', () => {
    it(':set spell로 활성화하고 :set nospell로 비활성화한다', () => {
      let state = createVimState(['hello world']);
      expect(state.options?.spell).toBeFalsy();

      state = runExCommand(state, 'set spell');
      expect(state.options?.spell).toBe(true);

      state = runExCommand(state, 'set nospell');
      expect(state.options?.spell).toBe(false);

      state = runExCommand(state, 'set spell!');
      expect(state.options?.spell).toBe(true);
    });
  });

  describe('오탈자 판별 및 오차 검출', () => {
    it('표준 영단어는 통과하고 잘못된 단어는 오탈자로 판정한다', () => {
      expect(isWordMisspelled('receive')).toBe(false);
      expect(isWordMisspelled('separate')).toBe(false);
      expect(isWordMisspelled('function')).toBe(false);

      // 오타
      expect(isWordMisspelled('recieve')).toBe(true);
      expect(isWordMisspelled('seperate')).toBe(true);
      expect(isWordMisspelled('fucntion')).toBe(true);

      // 1글자 단어는 스펠링 검사 제외
      expect(isWordMisspelled('a')).toBe(false);
      expect(isWordMisspelled('I')).toBe(false);
    });

    it('줄에서 오탈자의 정확한 열(col) 범위를 찾는다', () => {
      const line = 'Please recieve the mesage now.';
      const errors = findSpellErrorsInLine(line, 0);

      expect(errors.length).toBe(2);
      expect(errors[0]).toEqual({
        word: 'recieve',
        line: 0,
        startCol: 7,
        endCol: 14,
      });
      expect(errors[1]).toEqual({
        word: 'mesage',
        line: 0,
        startCol: 19,
        endCol: 25,
      });
    });
  });

  describe(']s 및 [s 점프 모션', () => {
    it('spell 옵션이 꺼져 있으면 ]s 모션 실행 시 bell이 울린다', () => {
      let state = createVimState(['hello recieve world']);
      state = sendKeys(state, ']s');
      expect(state.bell).toBe(true);
      expect(state.cursor.col).toBe(0);
    });

    it('spell 옵션이 켜져 있으면 ]s로 다음 오탈자의 첫 글자로 점프한다', () => {
      let state = createVimState([
        'const correct = true;',
        '// Please recieve this item',
        'function test() {}',
      ]);
      state = runExCommand(state, 'set spell');

      state = sendKeys(state, ']s');
      expect(state.cursor).toEqual({ line: 1, col: 10 }); // 'recieve'의 r 위치

      // 더 이상 오탈자가 없으면 bell 및 E752 에러
      state = sendKeys(state, ']s');
      expect(state.bell).toBe(true);
      expect(state.commandMessage).toContain('E752');
    });

    it('[s로 이전 오탈자의 첫 글자로 역방향 점프한다', () => {
      let state = createVimState([
        'first recieve here',
        'second mesage there',
      ]);
      state = runExCommand(state, 'set spell');
      state = { ...state, cursor: { line: 1, col: 18 } };

      state = sendKeys(state, '[s');
      expect(state.cursor).toEqual({ line: 1, col: 7 }); // 'mesage'

      state = sendKeys(state, '[s');
      expect(state.cursor).toEqual({ line: 0, col: 6 }); // 'recieve'
    });
  });

  describe('Damerau-Levenshtein 추천 단어 생성 (getSpellSuggestions)', () => {
    it('인접 문자 전치(transposition) 오타를 1순위로 올바르게 교정 추천한다', () => {
      expect(damerauLevenshtein('recieve', 'receive')).toBe(1);
      const suggestions = getSpellSuggestions('recieve');
      expect(suggestions[0]).toBe('receive');
    });

    it('원래 단어가 대문자로 시작하면 추천 단어도 대문자로 시작한다', () => {
      const suggestions = getSpellSuggestions('Recieve');
      expect(suggestions[0]).toBe('Receive');
    });
  });

  describe('z= 맞춤법 교체 대화형 세션', () => {
    it('오탈자가 아닌 정상 단어 위에서 z=를 누르면 bell이 울린다', () => {
      let state = createVimState(['correct word']);
      state = runExCommand(state, 'set spell');
      state = sendKeys(state, 'z=');
      expect(state.bell).toBe(true);
      expect(state.commandMessage).toContain('철자 오류가 아닙니다');
    });

    it('오탈자 위에서 z=를 누르면 추천 목록 프롬프트가 열린다', () => {
      let state = createVimState(['hello recieve world']);
      state = runExCommand(state, 'set spell');
      state = { ...state, cursor: { line: 0, col: 8 } }; // 'recieve' 위

      state = sendKeys(state, 'z=');
      expect(state.spellSuggest).toBeDefined();
      expect(state.spellSuggest?.word).toBe('recieve');
      expect(state.spellSuggest?.suggestions[0]).toBe('receive');
      expect(state.commandMessage).toContain('Change "recieve" to:');
    });

    it('추천 프롬프트에서 숫자 1을 누르면 1순위 추천 단어로 즉시 교체되고 NORMAL 모드로 복귀한다', () => {
      let state = createVimState(['hello recieve world']);
      state = runExCommand(state, 'set spell');
      state = { ...state, cursor: { line: 0, col: 8 } };

      state = sendKeys(state, 'z=');
      expect(state.spellSuggest).toBeDefined();

      state = handleKey(state, '1');
      expect(state.spellSuggest).toBeNull();
      expect(state.lines[0]).toBe('hello receive world');
      expect(state.commandMessage).toBeUndefined();

      // u 로 undo 복원 가능
      state = sendKeys(state, 'u');
      expect(state.lines[0]).toBe('hello recieve world');
    });

    it('추천 프롬프트에서 Escape를 누르면 변경 없이 취소된다', () => {
      let state = createVimState(['hello recieve world']);
      state = runExCommand(state, 'set spell');
      state = { ...state, cursor: { line: 0, col: 8 } };

      state = sendKeys(state, 'z=');
      expect(state.spellSuggest).toBeDefined();

      state = handleKey(state, 'Escape');
      expect(state.spellSuggest).toBeNull();
      expect(state.lines[0]).toBe('hello recieve world');
    });
  });

  describe('zg 및 zw 사용자 사전 추가/제외', () => {
    it('사전에 없는 단어에서 zg를 누르면 양호 단어로 등록되어 오타에서 제외된다', () => {
      let state = createVimState(['mycustomword is fine']);
      state = runExCommand(state, 'set spell');
      state = { ...state, cursor: { line: 0, col: 3 } };

      expect(isWordMisspelled('mycustomword', state)).toBe(true);

      state = sendKeys(state, 'zg');
      expect(state.spellGoodWords).toContain('mycustomword');
      expect(isWordMisspelled('mycustomword', state)).toBe(false);
      expect(state.commandMessage).toContain('사전에 추가되었습니다');
    });

    it('정상 단어에서 zw를 누르면 오탈자로 등록된다', () => {
      let state = createVimState(['hello world']);
      state = runExCommand(state, 'set spell');
      state = { ...state, cursor: { line: 0, col: 2 } };

      expect(isWordMisspelled('hello', state)).toBe(false);

      state = sendKeys(state, 'zw');
      expect(state.spellWrongWords).toContain('hello');
      expect(isWordMisspelled('hello', state)).toBe(true);
      expect(state.commandMessage).toContain('오탈자로 등록되었습니다');
    });
  });

  describe('영문 로케일 (locale: en) 메시지 검증', () => {
    it('영어 로케일일 때 실제 Vim 영어 에러 및 상태 문구를 출력한다', () => {
      configureVimEngine({ locale: 'en' });
      let state = createVimState(['hello world']);
      state = runExCommand(state, 'set spell');

      // 오타 없는 상태에서 ]s
      state = sendKeys(state, ']s');
      expect(state.commandMessage).toBe('E752: No more spell errors');

      // 정상 단어에서 z=
      state = sendKeys(state, 'z=');
      expect(state.commandMessage).toBe('Spell is OK');

      // zg 추가 메시지
      state = sendKeys(state, 'zg');
      expect(state.commandMessage).toContain('added to spellfile');

      // zw 추가 메시지
      state = sendKeys(state, 'zw');
      expect(state.commandMessage).toContain('added as bad word');
    });
  });
});
