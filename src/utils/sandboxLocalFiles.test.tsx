import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createVimState, sendKeys, getGitHunks } from '../vim-engine';
import {
  normalizeLocalFilePath,
  splitTextToLines,
  isBinaryText,
  readLocalFiles,
  mountLocalFilesIntoState,
  buildExportPayload,
  downloadCurrentBuffer,
  MAX_LOCAL_FILE_BYTES,
} from './sandboxLocalFiles';
import App from '../App';

describe('sandboxLocalFiles 유틸리티', () => {
  it('파일 경로 정규화, 개행 분리, 바이너리 판별을 정확히 수행한다', () => {
    expect(normalizeLocalFilePath('app.ts', './src\\utils//app.ts')).toBe('src/utils/app.ts');
    expect(normalizeLocalFilePath('/notes.md')).toBe('notes.md');
    expect(splitTextToLines('line1\r\nline2\r\n')).toEqual(['line1', 'line2']);
    expect(splitTextToLines('')).toEqual(['']);
    expect(isBinaryText('const ok = true;')).toBe(false);
    expect(isBinaryText('PNG\0binary')).toBe(true);
  });

  it('readLocalFiles 가 텍스트 파일은 파싱하고 바이너리·512KB 초과 파일은 제외한다', async () => {
    const validFile = new File(['const x = 1;\nconst y = 2;\n'], 'hello.ts', {
      type: 'text/typescript',
    });
    const binaryFile = new File(['abc\0def'], 'image.png', { type: 'image/png' });
    const hugeContent = 'a'.repeat(MAX_LOCAL_FILE_BYTES + 16);
    const hugeFile = new File([hugeContent], 'huge.log', { type: 'text/plain' });

    const result = await readLocalFiles([validFile, binaryFile, hugeFile]);
    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0].name).toBe('hello.ts');
    expect(result.loaded[0].lines).toEqual(['const x = 1;', 'const y = 2;']);
    expect(result.skipped).toEqual([
      { name: 'image.png', reason: 'binary' },
      { name: 'huge.log', reason: 'too-large' },
    ]);
  });

  it('mountLocalFilesIntoState 가 VFS·버퍼·Git 기준선·Harpoon 에 멀티파일을 마운트하고 :bnext/:e 연동된다', () => {
    let state = createVimState(['// initial sandbox']);
    state = { ...state, primaryFilename: 'sandbox.ts' };

    state = mountLocalFilesIntoState(state, [
      { name: 'alpha.ts', lines: ['export const a = 1;', 'export const b = 2;'], size: 39 },
      { name: 'beta.py', lines: ['def run():', '    return 42'], size: 24 },
    ]);

    expect(state.primaryFilename).toBe('alpha.ts');
    expect(state.lines).toEqual(['export const a = 1;', 'export const b = 2;']);
    expect(state.virtualFiles?.['alpha.ts']).toEqual(['export const a = 1;', 'export const b = 2;']);
    expect(state.virtualFiles?.['beta.py']).toEqual(['def run():', '    return 42']);
    expect(state.gitBaseLines).toEqual(['export const a = 1;', 'export const b = 2;']);
    expect(state.harpoonList?.slice(0, 2)).toEqual(['alpha.ts', 'beta.py']);

    // 수정 시 로컬 파일 원본(gitBaseLines) 대비 Git Hunk 가 즉시 감지된다
    state = sendKeys(state, 'ccexport const a = 99;<Esc>');
    expect(getGitHunks(state).length).toBe(1);

    // :bnext 로 두 번째 불러온 파일(beta.py)로 즉시 전환 가능
    state = sendKeys(state, ':bnext<CR>');
    expect(state.primaryFilename).toBe('beta.py');
    expect(state.lines).toEqual(['def run():', '    return 42']);
  });

  it('buildExportPayload 와 downloadCurrentBuffer 가 활성 파일명으로 다운로드 트리거를 수행한다', () => {
    const state = {
      ...createVimState(['const a = 1;', 'const b = 2;']),
      primaryFilename: 'src/feature/demo.ts',
    };
    const payload = buildExportPayload(state);
    expect(payload).toEqual({
      filename: 'demo.ts',
      content: 'const a = 1;\nconst b = 2;\n',
      lineCount: 2,
    });

    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const createUrlSpy = vi.fn(() => 'blob:mock-url');
    const revokeUrlSpy = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createUrlSpy, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeUrlSpy, configurable: true, writable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const exported = downloadCurrentBuffer(state);
    expect(exported.filename).toBe('demo.ts');
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrlSpy).toHaveBeenCalledWith('blob:mock-url');

    Object.defineProperty(URL, 'createObjectURL', { value: origCreate, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: origRevoke, configurable: true, writable: true });
    clickSpy.mockRestore();
  });
});

describe('자유 연습장(Sandbox) 로컬 파일 드래그&드롭 & 내보내기 UI 통합', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('파일 선택·드래그&드롭으로 멀티 로컬 파일을 불러오고 칩 전환 및 파일 내보내기가 동작한다', async () => {
    render(<App />);

    // 자유 연습장 탭으로 이동
    fireEvent.click(screen.getByTestId('tab-sandbox-btn'));
    expect(screen.getByTestId('sandbox-import-file-btn')).toBeInTheDocument();
    expect(screen.getByTestId('sandbox-export-file-btn')).toBeInTheDocument();

    // 멀티 로컬 파일 드래그&드롭 시뮬레이션
    const mainWorkspace = screen.getByTestId('main-workspace');
    const file1 = new File(['const greeting = "hello local";\n'], 'local_one.ts', {
      type: 'text/typescript',
    });
    const file2 = new File(['# Notes\n- item 1\n'], 'notes.md', {
      type: 'text/markdown',
    });

    fireEvent.dragEnter(mainWorkspace, { dataTransfer: { files: [file1, file2] } });
    expect(screen.getByTestId('sandbox-drop-overlay')).toBeInTheDocument();

    fireEvent.drop(mainWorkspace, { dataTransfer: { files: [file1, file2] } });

    await waitFor(() => {
      expect(screen.getByTestId('sandbox-local-file-local_one.ts')).toBeInTheDocument();
      expect(screen.getByTestId('sandbox-local-file-notes.md')).toBeInTheDocument();
    });

    expect(screen.getByTestId('editor-container')).toHaveTextContent('hello local');
    expect(screen.getByTestId('status-bar')).toHaveTextContent('local_one.ts');

    // 두 번째 파일 칩 클릭 시 notes.md 로 즉시 전환
    fireEvent.click(screen.getByTestId('sandbox-local-file-notes.md'));
    expect(screen.getByTestId('editor-container')).toHaveTextContent('# Notes');
    expect(screen.getByTestId('status-bar')).toHaveTextContent('notes.md');

    // 파일 내보내기 버튼 클릭
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const createUrlSpy = vi.fn(() => 'blob:export-notes');
    const revokeUrlSpy = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createUrlSpy, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeUrlSpy, configurable: true, writable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByTestId('sandbox-export-file-btn'));
    await waitFor(() => expect(createUrlSpy).toHaveBeenCalledTimes(1));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrlSpy).toHaveBeenCalledWith('blob:export-notes');

    Object.defineProperty(URL, 'createObjectURL', { value: origCreate, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: origRevoke, configurable: true, writable: true });
    clickSpy.mockRestore();
  });
});
