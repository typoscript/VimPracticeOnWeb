import { useState, useCallback, useEffect, Dispatch, SetStateAction } from 'react';
import { VimEditorState } from '../vim-engine';
import {
  loadRelativeLineSetting,
  saveRelativeLineSetting,
  loadVirtualKeyboardSetting,
  saveVirtualKeyboardSetting,
  loadDiffViewSetting,
  saveDiffViewSetting,
  loadRegisterInspectorSetting,
  saveRegisterInspectorSetting,
  loadMarksVisualizerSetting,
  saveMarksVisualizerSetting,
  loadGrammarASTSetting,
  saveGrammarASTSetting,
  loadWhichKeySetting,
  saveWhichKeySetting,
} from '../utils/storage';

interface UseEditorViewSettingsParams {
  editorState: VimEditorState;
  setEditorState: Dispatch<SetStateAction<VimEditorState>>;
}

/**
 * 에디터 보조 패널 표시 옵션(상대 줄번호, 가상 키보드, Diff, 레지스터, 마크, 문법 AST, 매크로 디버거)과
 * 모달 열림 상태를 관리하는 훅입니다.
 */
export function useEditorViewSettings({
  editorState,
  setEditorState,
}: UseEditorViewSettingsParams) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isDailyModalOpen, setIsDailyModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isBYOCModalOpen, setIsBYOCModalOpen] = useState(false);

  const [relativeLineNumbers, setRelativeLineNumbers] = useState<boolean>(() =>
    loadRelativeLineSetting()
  );
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState<boolean>(() =>
    loadVirtualKeyboardSetting()
  );
  const [showDiffView, setShowDiffView] = useState<boolean>(() => loadDiffViewSetting());
  const [showRegisterInspector, setShowRegisterInspector] = useState<boolean>(() =>
    loadRegisterInspectorSetting()
  );
  const [showMarksVisualizer, setShowMarksVisualizer] = useState<boolean>(() =>
    loadMarksVisualizerSetting()
  );
  const [showGrammarAST, setShowGrammarAST] = useState<boolean>(() => loadGrammarASTSetting());
  const [showWhichKey, setShowWhichKey] = useState<boolean>(() => loadWhichKeySetting());
  const [showMacroDebugger, setShowMacroDebugger] = useState<boolean>(false);

  // Vim 엔진 상태 플래그/옵션 변경에 따라 UI 패널 상태를 동기화
  useEffect(() => {
    if (editorState.showRegisterInspector !== undefined) {
      setShowRegisterInspector(editorState.showRegisterInspector);
    }
  }, [editorState.showRegisterInspector]);

  useEffect(() => {
    if (editorState.showMarksVisualizer !== undefined) {
      setShowMarksVisualizer(editorState.showMarksVisualizer);
    }
  }, [editorState.showMarksVisualizer]);

  useEffect(() => {
    if (editorState.options?.relativenumber !== undefined) {
      setRelativeLineNumbers(editorState.options.relativenumber);
      saveRelativeLineSetting(editorState.options.relativenumber);
    }
  }, [editorState.options?.relativenumber]);

  useEffect(() => {
    if (editorState.showConfigModal !== undefined) {
      setIsConfigModalOpen(editorState.showConfigModal);
    }
  }, [editorState.showConfigModal]);

  const handleToggleRegisterInspector = useCallback(() => {
    setShowRegisterInspector((prev) => {
      const next = !prev;
      saveRegisterInspectorSetting(next);
      return next;
    });
  }, []);

  const handleToggleMarksVisualizer = useCallback(() => {
    setShowMarksVisualizer((prev) => {
      const next = !prev;
      saveMarksVisualizerSetting(next);
      return next;
    });
  }, []);

  const handleToggleGrammarAST = useCallback(() => {
    setShowGrammarAST((prev) => {
      const next = !prev;
      saveGrammarASTSetting(next);
      return next;
    });
  }, []);

  const handleToggleWhichKey = useCallback(() => {
    setShowWhichKey((prev) => {
      const next = !prev;
      saveWhichKeySetting(next);
      return next;
    });
  }, []);

  const handleToggleVirtualKeyboard = useCallback(() => {
    setShowVirtualKeyboard((prev) => {
      const next = !prev;
      saveVirtualKeyboardSetting(next);
      return next;
    });
  }, []);

  const handleToggleDiffView = useCallback(() => {
    setShowDiffView((prev) => {
      const next = !prev;
      saveDiffViewSetting(next);
      return next;
    });
  }, []);

  const enableDiffView = useCallback(() => {
    setShowDiffView(true);
    saveDiffViewSetting(true);
  }, []);

  const handleToggleRelativeLine = useCallback(() => {
    setRelativeLineNumbers((prev) => {
      const next = !prev;
      saveRelativeLineSetting(next);
      setEditorState((st) => ({
        ...st,
        options: {
          number: st.options?.number ?? true,
          relativenumber: next,
          ignorecase: st.options?.ignorecase ?? false,
          smartcase: st.options?.smartcase ?? false,
          hlsearch: st.options?.hlsearch ?? true,
          wrap: st.options?.wrap ?? true,
          cursorline: st.options?.cursorline ?? true,
          tabstop: st.options?.tabstop ?? 2,
          shiftwidth: st.options?.shiftwidth ?? 2,
          expandtab: st.options?.expandtab ?? true,
          list: st.options?.list ?? false,
          wildmenu: st.options?.wildmenu ?? true,
          spell: st.options?.spell ?? false,
        },
      }));
      return next;
    });
  }, [setEditorState]);

  const handleToggleMacroDebugger = useCallback(() => {
    setShowMacroDebugger((prev) => !prev);
  }, []);

  const handleOpenMacroDebugger = useCallback((_register: string) => {
    setShowMacroDebugger(true);
  }, []);

  const restoreViewSettings = useCallback(() => {
    setRelativeLineNumbers(loadRelativeLineSetting());
    setShowVirtualKeyboard(loadVirtualKeyboardSetting());
    setShowDiffView(loadDiffViewSetting());
    setShowRegisterInspector(loadRegisterInspectorSetting());
    setShowMarksVisualizer(loadMarksVisualizerSetting());
    setShowGrammarAST(loadGrammarASTSetting());
    setShowWhichKey(loadWhichKeySetting());
  }, []);

  const isAnyModalOpen =
    isModalOpen ||
    isCustomModalOpen ||
    isAnalyticsModalOpen ||
    isDailyModalOpen ||
    isConfigModalOpen ||
    isBYOCModalOpen;

  return {
    isModalOpen,
    setIsModalOpen,
    isCustomModalOpen,
    setIsCustomModalOpen,
    isAnalyticsModalOpen,
    setIsAnalyticsModalOpen,
    isDailyModalOpen,
    setIsDailyModalOpen,
    isConfigModalOpen,
    setIsConfigModalOpen,
    isBYOCModalOpen,
    setIsBYOCModalOpen,
    isAnyModalOpen,
    relativeLineNumbers,
    showVirtualKeyboard,
    showDiffView,
    showRegisterInspector,
    showMarksVisualizer,
    showGrammarAST,
    setShowGrammarAST,
    showWhichKey,
    setShowWhichKey,
    showMacroDebugger,
    handleToggleRegisterInspector,
    handleToggleMarksVisualizer,
    handleToggleGrammarAST,
    handleToggleWhichKey,
    handleToggleVirtualKeyboard,
    handleToggleDiffView,
    enableDiffView,
    handleToggleRelativeLine,
    handleToggleMacroDebugger,
    handleOpenMacroDebugger,
    restoreViewSettings,
  };
}
