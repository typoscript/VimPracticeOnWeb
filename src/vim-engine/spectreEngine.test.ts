import { describe, it, expect } from 'vitest';
import {
  createVimState,
  runExCommand,
  handleKey,
  updateSpectreQuery,
  toggleSpectreItem,
  toggleAllSpectreItems,
  jumpToSpectreItem,
  applySpectreReplaceAll,
} from './index';

describe('nvim-spectre 스타일 프로젝트 대화형 검색·치환 엔진 (:Spectre)', () => {
  it(':Spectre search replace 로 프로젝트 전체 매치와 치환 미리보기를 수집한다', () => {
    let s = createVimState(['const url = "https://v1.api.com";', 'const keep = "ok";']);
    s = {
      ...s,
      primaryFilename: 'src/app.ts',
      virtualFiles: {
        'src/app.ts': ['const url = "https://v1.api.com";', 'const keep = "ok";'],
        'src/worker.ts': ['export const endpoint = "v1/jobs";'],
      },
    };

    s = runExCommand(s, ':Spectre v1 v2');
    expect(s.spectrePanel?.isOpen).toBe(true);
    expect(s.spectrePanel?.searchQuery).toBe('v1');
    expect(s.spectrePanel?.replaceQuery).toBe('v2');
    expect(s.spectrePanel?.items).toHaveLength(2);
    expect(s.spectrePanel?.items[0].previewText).toContain('v2');
  });

  it('개별 항목 체크 해제(toggleSpectreItem) 후 applySpectreReplaceAll 실행 시 활성 항목만 일괄 치환하고 u 로 현재 버퍼를 복원한다', () => {
    let s = createVimState(['const a = "v1";', 'const b = "v1";']);
    s = {
      ...s,
      primaryFilename: 'src/app.ts',
      virtualFiles: {
        'src/app.ts': ['const a = "v1";', 'const b = "v1";'],
        'src/worker.ts': ['export const w = "v1";'],
      },
    };

    s = runExCommand(s, ':Spectre v1 v2');
    const secondId = s.spectrePanel!.items[1].id; // src/app.ts:1
    s = toggleSpectreItem(s, secondId);
    expect(s.spectrePanel!.items[1].enabled).toBe(false);

    // 일괄 치환 적용
    s = applySpectreReplaceAll(s);
    expect(s.lines).toEqual(['const a = "v2";', 'const b = "v1";']);
    expect(s.virtualFiles?.['src/worker.ts']).toEqual(['export const w = "v2";']);

    // 현재 버퍼 Undo 지원
    s = handleKey(s, 'u');
    expect(s.lines).toEqual(['const a = "v1";', 'const b = "v1";']);
  });

  it('updateSpectreQuery, toggleAllSpectreItems, jumpToSpectreItem, :SpectreClose 가 정상 동작한다', () => {
    let s = createVimState(['hello world']);
    s = {
      ...s,
      primaryFilename: 'src/a.ts',
      virtualFiles: {
        'src/a.ts': ['hello world'],
        'src/b.ts': ['HELLO there'],
      },
    };

    s = runExCommand(s, ':Spectre');
    s = updateSpectreQuery(s, 'hello', 'hi', true); // ignoreCase = true
    expect(s.spectrePanel?.items).toHaveLength(2);

    s = toggleAllSpectreItems(s, false);
    expect(s.spectrePanel?.items.every((i) => !i.enabled)).toBe(true);

    // 다른 파일 매치로 점프
    s = jumpToSpectreItem(s, 1);
    expect(s.primaryFilename).toBe('src/b.ts');

    s = runExCommand(s, ':SpectreClose');
    expect(s.spectrePanel).toBeNull();
  });
});
