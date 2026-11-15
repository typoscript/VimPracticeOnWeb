import { useEffect, MutableRefObject } from 'react';
import { VimMode } from '../vim-engine';
import { HardcoreGuard } from '../utils/hardcoreGuard';
import { normalizeImeKey } from '../utils/imeHelper';
import { t } from '../i18n';

interface UseVimKeyboardInputParams {
  isModalOrGameBlocked: boolean;
  isGhostReplaying: boolean;
  handleStopGhostReplay: () => void;
  isEditorFocused: boolean;
  setIsEditorFocused: (focused: boolean) => void;
  editorMode: VimMode;
  activePresets: Record<string, boolean>;
  hardcoreMode: boolean;
  hardcoreGuardRef: MutableRefObject<HardcoreGuard>;
  triggerHardcoreViolation: (msg: string, suggestion?: string) => void;
  setCoachingMessage: (msg: string | null) => void;
  processKeyInput: (key: string) => void;
}

const STANDALONE_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

const BROWSER_PREVENT_DEFAULT_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ' ',
  'Backspace',
  'Tab',
  '/',
  'Enter',
  'PageUp',
  'PageDown',
]);

interface ModifierShortcutRule {
  allowAlt: boolean;
  vimKey: string;
  appliesTo: (mode: VimMode, activePresets: Record<string, boolean>) => boolean;
}

const isNormalOrVisual = (mode: VimMode) => mode === 'NORMAL' || mode.startsWith('VISUAL');
const isNonTextInputMode = (mode: VimMode) =>
  mode !== 'INSERT' && mode !== 'COMMAND' && mode !== 'SEARCH' && mode !== 'REPLACE';

const MODIFIER_SHORTCUTS: Record<string, ModifierShortcutRule> = {
  r: { allowAlt: false, vimKey: 'Ctrl-r', appliesTo: () => true },
  w: {
    allowAlt: true,
    vimKey: 'Ctrl-w',
    appliesTo: (mode) => isNormalOrVisual(mode) || mode === 'INSERT',
  },
  h: { allowAlt: true, vimKey: 'Ctrl-h', appliesTo: (mode) => mode === 'INSERT' },
  n: { allowAlt: true, vimKey: 'Ctrl-n', appliesTo: (mode) => mode === 'INSERT' },
  p: { allowAlt: true, vimKey: 'Ctrl-p', appliesTo: (mode) => mode === 'INSERT' },
  f: { allowAlt: false, vimKey: '/', appliesTo: () => true },
  v: { allowAlt: false, vimKey: 'Ctrl-v', appliesTo: (mode) => isNonTextInputMode(mode) },
  '^': { allowAlt: false, vimKey: 'Ctrl-^', appliesTo: () => true },
  '6': { allowAlt: false, vimKey: 'Ctrl-^', appliesTo: () => true },
  o: {
    allowAlt: true,
    vimKey: 'Ctrl-o',
    appliesTo: (mode) => mode === 'NORMAL' || mode === 'INSERT',
  },
  i: { allowAlt: false, vimKey: 'Ctrl-i', appliesTo: (mode) => mode === 'NORMAL' },
  a: { allowAlt: true, vimKey: 'Ctrl-a', appliesTo: (mode) => isNormalOrVisual(mode) },
  x: { allowAlt: true, vimKey: 'Ctrl-x', appliesTo: (mode) => isNormalOrVisual(mode) },
  d: { allowAlt: false, vimKey: 'Ctrl-d', appliesTo: (mode) => isNormalOrVisual(mode) },
  g: { allowAlt: false, vimKey: 'Ctrl-g', appliesTo: (mode) => isNormalOrVisual(mode) },
  u: {
    allowAlt: true,
    vimKey: 'Ctrl-u',
    appliesTo: (mode) => isNormalOrVisual(mode) || mode === 'INSERT',
  },
};

/**
 * 전역 window 포커스/블러 및 Vim 에디터 키보드/IME 입력 처리를 담당하는 훅입니다.
 */
export function useVimKeyboardInput({
  isModalOrGameBlocked,
  isGhostReplaying,
  handleStopGhostReplay,
  isEditorFocused,
  setIsEditorFocused,
  editorMode,
  activePresets,
  hardcoreMode,
  hardcoreGuardRef,
  triggerHardcoreViolation,
  setCoachingMessage,
  processKeyInput,
}: UseVimKeyboardInputParams) {
  useEffect(() => {
    const handleWindowFocus = () => setIsEditorFocused(true);
    const handleWindowBlur = () => setIsEditorFocused(false);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [setIsEditorFocused]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGhostReplaying) {
        handleStopGhostReplay();
        return;
      }

      if (isModalOrGameBlocked) {
        return;
      }

      if (!isEditorFocused) {
        setIsEditorFocused(true);
      }

      if (STANDALONE_MODIFIERS.has(e.key)) {
        return;
      }

      const lowerKey = e.key.toLowerCase();

      // Ctrl+h/j/k/l 분할 창 빠른 이동 (프리셋 활성화 시)
      if (
        (e.ctrlKey || e.metaKey) &&
        ['h', 'j', 'k', 'l'].includes(lowerKey) &&
        editorMode === 'NORMAL' &&
        activePresets['ctrlWindowNav']
      ) {
        e.preventDefault();
        processKeyInput(`Ctrl-${lowerKey}`);
        return;
      }

      const rule = MODIFIER_SHORTCUTS[lowerKey] ?? MODIFIER_SHORTCUTS[e.key];
      if (
        rule &&
        (e.ctrlKey || e.metaKey || (rule.allowAlt && e.altKey)) &&
        rule.appliesTo(editorMode, activePresets)
      ) {
        e.preventDefault();
        processKeyInput(rule.vimKey);
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      if (BROWSER_PREVENT_DEFAULT_KEYS.has(e.key)) {
        e.preventDefault();
      }

      if (
        document.activeElement &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement.tagName !== 'BODY'
      ) {
        document.activeElement.blur();
      }

      const { key: normalizedKey, isNormalized } = normalizeImeKey(e, editorMode);

      if (isNormalized) {
        setCoachingMessage(
          t(
            "💡 한글 입력이 감지되어 영문('{normalizedKey}')으로 자동 매핑되었습니다. 원활한 입력을 위해 [한/영] 전환을 권장합니다.",
            { normalizedKey }
          )
        );
      } else if (e.key === 'Process' || /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(e.key)) {
        setCoachingMessage(
          t(
            '⚠️ 현재 한글 입력 상태입니다. 원활한 Vim 명령어 입력을 위해 [한/영] 키를 눌러 영문 모드로 전환해 주세요!'
          )
        );
      }

      if (hardcoreMode) {
        const check = hardcoreGuardRef.current.checkKey(normalizedKey, Date.now());
        if (check.blocked) {
          triggerHardcoreViolation(check.message!, check.suggestion);
          e.preventDefault();
          return;
        }
      }

      processKeyInput(normalizedKey);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isModalOrGameBlocked,
    activePresets,
    isGhostReplaying,
    handleStopGhostReplay,
    isEditorFocused,
    setIsEditorFocused,
    editorMode,
    hardcoreMode,
    hardcoreGuardRef,
    triggerHardcoreViolation,
    setCoachingMessage,
    processKeyInput,
  ]);
}
