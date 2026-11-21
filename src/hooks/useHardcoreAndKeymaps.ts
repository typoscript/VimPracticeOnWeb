import { useEffect, useState, useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { VimEditorState } from '../vim-engine';
import { HardcoreGuard } from '../utils/hardcoreGuard';
import { loadHardcoreMode, saveHardcoreMode } from '../utils/storage';
import { loadThemeSetting, saveThemeSetting, applyTheme, VimTheme } from '../utils/theme';
import {
  loadActivePresets,
  saveActivePresets,
  loadLeaderKey,
  saveLeaderKey,
  loadCustomKeymaps,
  saveCustomKeymaps,
  compileUserKeymaps,
  CustomKeymapItem,
} from '../utils/keymapStorage';
import {
  UserInitConfig,
  loadUserInitConfig,
  saveUserInitConfig,
  applyUserInitConfigToState,
} from '../utils/userInitConfig';
import { t } from '../i18n';

/**
 * 하드코어 모드 가드, 사용자 키매핑 프리셋/리더키, 테마 설정 상태를 통합 관리하는 훅입니다.
 */
export function useHardcoreAndKeymaps(
  setEditorStateRef: { current: Dispatch<SetStateAction<VimEditorState>> | null }
) {
  const [hardcoreMode, setHardcoreMode] = useState<boolean>(() => loadHardcoreMode());
  const hardcoreGuardRef = useRef(new HardcoreGuard());
  const [isEditorShaking, setIsEditorShaking] = useState(false);
  const [hardcoreWarning, setHardcoreWarning] = useState<string | null>(null);
  const shakeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, []);

  const handleToggleHardcoreMode = useCallback(() => {
    setHardcoreMode((prev) => {
      const next = !prev;
      saveHardcoreMode(next);
      return next;
    });
  }, []);

  const triggerHardcoreViolation = useCallback((msg: string, suggestion?: string) => {
    setIsEditorShaking(true);
    setHardcoreWarning(`${msg}${suggestion ? ` 👉 ${suggestion}` : ''}`);

    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      setIsEditorShaking(false);
    }, 400);

    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningTimerRef.current = setTimeout(() => {
      setHardcoreWarning(null);
    }, 2800);
  }, []);

  const dismissHardcoreWarning = useCallback(() => {
    setHardcoreWarning(null);
  }, []);

  const handleEditorAreaClick = useCallback(() => {
    if (hardcoreMode) {
      const check = hardcoreGuardRef.current.checkMouseClick();
      if (check.blocked) {
        triggerHardcoreViolation(check.message!, check.suggestion);
      }
    }
  }, [hardcoreMode, triggerHardcoreViolation]);

  const [activePresets, setActivePresets] = useState<Record<string, boolean>>(() => loadActivePresets());
  const [leaderKey, setLeaderKey] = useState<string>(() => loadLeaderKey());
  const [customKeymaps, setCustomKeymaps] = useState<CustomKeymapItem[]>(() => loadCustomKeymaps());
  const [userInitConfig, setUserInitConfig] = useState<UserInitConfig>(() => loadUserInitConfig());

  const updateKeymapsInEditor = useCallback(
    (
      presets: Record<string, boolean>,
      leader: string,
      maps: CustomKeymapItem[],
      extras?: { leaderKey?: string; commandMessage?: string }
    ) => {
      setEditorStateRef.current?.((st) => ({
        ...st,
        ...extras,
        userKeymaps: compileUserKeymaps(presets, leader, maps),
      }));
    },
    [setEditorStateRef]
  );

  const handleTogglePreset = useCallback(
    (presetId: string) => {
      setActivePresets((prev) => {
        const updated = { ...prev, [presetId]: !prev[presetId] };
        saveActivePresets(updated);
        updateKeymapsInEditor(updated, leaderKey, customKeymaps);
        return updated;
      });
    },
    [leaderKey, customKeymaps, updateKeymapsInEditor]
  );

  const handleChangeLeaderKey = useCallback(
    (newLeader: string) => {
      setLeaderKey(newLeader);
      saveLeaderKey(newLeader);
      updateKeymapsInEditor(activePresets, newLeader, customKeymaps, { leaderKey: newLeader });
    },
    [activePresets, customKeymaps, updateKeymapsInEditor]
  );

  const handleAddCustomKeymap = useCallback(
    (item: Omit<CustomKeymapItem, 'id'>) => {
      const newItem: CustomKeymapItem = {
        ...item,
        id: `map_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      };
      setCustomKeymaps((prev) => {
        const updated = [...prev, newItem];
        saveCustomKeymaps(updated);
        updateKeymapsInEditor(activePresets, leaderKey, updated, {
          commandMessage: t('[키매핑 등록] {mode}: {from} -> {to}', {
            mode: item.mode,
            from: item.from,
            to: item.to,
          }),
        });
        return updated;
      });
    },
    [activePresets, leaderKey, updateKeymapsInEditor]
  );

  const handleDeleteCustomKeymap = useCallback(
    (id: string) => {
      setCustomKeymaps((prev) => {
        const target = prev.find((m) => m.id === id);
        const updated = prev.filter((m) => m.id !== id);
        saveCustomKeymaps(updated);
        updateKeymapsInEditor(activePresets, leaderKey, updated, {
          commandMessage: target
            ? t('[키매핑 삭제] {mode}: {from}', { mode: target.mode, from: target.from })
            : undefined,
        });
        return updated;
      });
    },
    [activePresets, leaderKey, updateKeymapsInEditor]
  );

  const handleApplyUserInitConfig = useCallback(
    (nextCfg: UserInitConfig): { ok: boolean; message: string } => {
      // 먼저 가상 검증을 수행해 구문 오류가 있으면 기존 에디터 상태를 건드리지 않고 에러 반환
      const probeState: VimEditorState = {
        lines: [''],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        leaderKey,
        userKeymaps: compileUserKeymaps(activePresets, leaderKey, customKeymaps),
      };
      const check = applyUserInitConfigToState(probeState, nextCfg);
      if (!check.ok) {
        return { ok: false, message: check.message };
      }

      setUserInitConfig(nextCfg);
      saveUserInitConfig(nextCfg);
      setEditorStateRef.current?.((st) => {
        const base: VimEditorState = {
          ...st,
          leaderKey,
          userKeymaps: compileUserKeymaps(activePresets, leaderKey, customKeymaps),
        };
        const applied = applyUserInitConfigToState(base, nextCfg);
        return applied.ok
          ? { ...applied.state, commandMessage: applied.message }
          : st;
      });
      return { ok: true, message: check.message };
    },
    [activePresets, leaderKey, customKeymaps, setEditorStateRef]
  );

  const [currentTheme, setCurrentTheme] = useState<VimTheme>(() => loadThemeSetting());
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const handleThemeChange = useCallback((newTheme: VimTheme) => {
    setCurrentTheme(newTheme);
    saveThemeSetting(newTheme);
    applyTheme(newTheme);
  }, []);

  const reloadHardcoreAndKeymaps = useCallback(() => {
    setActivePresets(loadActivePresets());
    setLeaderKey(loadLeaderKey());
    setCustomKeymaps(loadCustomKeymaps());
    setUserInitConfig(loadUserInitConfig());
    setHardcoreMode(loadHardcoreMode());
    const restoredTheme = loadThemeSetting();
    setCurrentTheme(restoredTheme);
    applyTheme(restoredTheme);
  }, []);

  return {
    hardcoreMode,
    hardcoreGuardRef,
    isEditorShaking,
    hardcoreWarning,
    dismissHardcoreWarning,
    handleToggleHardcoreMode,
    triggerHardcoreViolation,
    handleEditorAreaClick,
    activePresets,
    leaderKey,
    customKeymaps,
    userInitConfig,
    handleTogglePreset,
    handleChangeLeaderKey,
    handleAddCustomKeymap,
    handleDeleteCustomKeymap,
    handleApplyUserInitConfig,
    currentTheme,
    handleThemeChange,
    reloadHardcoreAndKeymaps,
  };
}
