import { useEffect, useRef } from 'react';
import type { VimEditorState } from '../vim-engine';
import { saveSandboxAutosave } from '../utils/sandboxAutosave';

const SAVE_DELAY_MS = 800;

/**
 * 자유 연습장에서 편집한 내용을 브라우저 저장소에 자동 저장합니다 (입력이 멈추고 0.8초 뒤, 그리고 페이지를 떠날 때).
 * 키를 하나도 누르지 않았고 불러온 파일도 없으면 저장하지 않아, 기본 예제를 그대로 둔 채로는 저장본이 생기지 않습니다.
 */
export function useSandboxAutosave(
  editorState: VimEditorState,
  active: boolean,
  hasUserEdits: boolean,
  localFiles: readonly string[]
): void {
  const shouldSave = active && (hasUserEdits || localFiles.length > 0);
  const latestRef = useRef({ editorState, localFiles, shouldSave });
  latestRef.current = { editorState, localFiles, shouldSave };

  useEffect(() => {
    if (!shouldSave) return;
    const timer = window.setTimeout(() => saveSandboxAutosave(editorState, localFiles), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [shouldSave, editorState, localFiles]);

  // 새로고침·탭 닫기 직전에는 기다리지 않고 바로 저장합니다.
  useEffect(() => {
    const flush = () => {
      const { editorState: state, localFiles: files, shouldSave: save } = latestRef.current;
      if (save) saveSandboxAutosave(state, files);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);
}
