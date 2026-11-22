import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createVimState } from '../vim-engine';
import { computeCrc32, buildZipArchive } from './zipBuilder';
import {
  collectWorkspaceFilesForExport,
  downloadWorkspaceAsZip,
  mountLocalFilesIntoState,
} from './sandboxLocalFiles';
import App from '../App';

describe('순수 TypeScript ZIP 아카이브 빌더 (zipBuilder)', () => {
  it('표준 IEEE CRC-32 체크섬을 정확히 계산한다', () => {
    const bytes = new TextEncoder().encode('123456789');
    expect(computeCrc32(bytes)).toBe(0xcbf43926);
  });

  it('멀티파일과 한글 UTF-8 경로/내용을 표준 PKZIP 구조(Local/Central/EOCD)로 직렬화한다', () => {
    const zip = buildZipArchive([
      { path: 'src/index.ts', content: 'export const ok = true;\n' },
      { path: 'docs/안내.md', content: '# 한글 테스트\n' },
    ]);

    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // Local file header signature (PK\x03\x04)
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // End of Central Directory signature (PK\x05\x06) at end - 22
    const eocdOffset = zip.byteLength - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdOffset + 8, true)).toBe(2);
    expect(view.getUint16(eocdOffset + 10, true)).toBe(2);

    const centralOffset = view.getUint32(eocdOffset + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);

    const text = new TextDecoder().decode(zip);
    expect(text).toContain('src/index.ts');
    expect(text).toContain('docs/안내.md');
    expect(text).toContain('# 한글 테스트');
  });
});

describe('자유 연습장 폴더 열기 & 멀티파일 .zip 내보내기', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('collectWorkspaceFilesForExport 와 downloadWorkspaceAsZip 이 VFS + 수정 버퍼 전체를 묶는다', () => {
    let state = createVimState(['// sandbox']);
    state = { ...state, primaryFilename: 'sandbox.ts' };
    state = mountLocalFilesIntoState(state, [
      { name: 'proj/src/a.ts', lines: ['const a = 1;'], size: 12 },
      { name: 'proj/src/b.ts', lines: ['const b = 2;'], size: 12 },
    ]);
    // 현재 활성 파일(proj/src/a.ts) 수정 반영
    state = { ...state, lines: ['const a = 999;'] };

    const entries = collectWorkspaceFilesForExport(state);
    const entryA = entries.find((e) => e.path === 'proj/src/a.ts');
    const entryB = entries.find((e) => e.path === 'proj/src/b.ts');
    expect(entryA?.content).toBe('const a = 999;\n');
    expect(entryB?.content).toBe('const b = 2;\n');

    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const createSpy = vi.fn(() => 'blob:zip-url');
    const revokeSpy = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createSpy, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeSpy, configurable: true, writable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const res = downloadWorkspaceAsZip(state, 'my-proj.zip');
    expect(res.filename).toBe('my-proj.zip');
    expect(res.fileCount).toBeGreaterThanOrEqual(2);
    expect(res.byteLength).toBeGreaterThan(100);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:zip-url');

    Object.defineProperty(URL, 'createObjectURL', { value: origCreate, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: origRevoke, configurable: true, writable: true });
    clickSpy.mockRestore();
  });

  it('Sandbox UI 에서 폴더 입력(webkitRelativePath)으로 트리 마운트 후 ZIP 내보내기 버튼이 동작한다', async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('tab-sandbox-btn'));

    const folderInput = screen.getByTestId('sandbox-local-folder-input') as HTMLInputElement;
    expect(folderInput.hasAttribute('webkitdirectory')).toBe(true);

    const f1 = new File(['export const one = 1;\n'], 'one.ts', { type: 'text/typescript' });
    Object.defineProperty(f1, 'webkitRelativePath', { value: 'demo-app/src/one.ts' });
    const f2 = new File(['export const two = 2;\n'], 'two.ts', { type: 'text/typescript' });
    Object.defineProperty(f2, 'webkitRelativePath', { value: 'demo-app/src/two.ts' });

    fireEvent.change(folderInput, { target: { files: [f1, f2] } });

    await waitFor(() => {
      expect(screen.getByTestId('sandbox-local-file-demo-app/src/one.ts')).toBeInTheDocument();
      expect(screen.getByTestId('sandbox-local-file-demo-app/src/two.ts')).toBeInTheDocument();
    });

    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const createSpy = vi.fn(() => 'blob:workspace-zip');
    const revokeSpy = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createSpy, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeSpy, configurable: true, writable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByTestId('sandbox-export-zip-btn'));
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:workspace-zip');

    Object.defineProperty(URL, 'createObjectURL', { value: origCreate, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: origRevoke, configurable: true, writable: true });
    clickSpy.mockRestore();
  });
});
