import React from 'react';
import { VimMode } from '../../vim-engine';
import './VirtualKeyboard.css';

export interface VirtualKeyboardProps {
  mode: VimMode;
  lastPressedKey?: string;
  onKeyPress?: (key: string) => void;
}

interface KeyDef {
  key: string;
  label: string;
  subLabel?: string;
  role?: 'motion' | 'operator' | 'insert' | 'visual' | 'search' | 'control' | 'special';
  width?: 'normal' | 'wide' | 'extra-wide' | 'space';
}

export const KEYBOARD_ROWS: KeyDef[][] = [
  // 1행: 숫자 및 기호
  [
    { key: 'Escape', label: 'Esc', role: 'control', width: 'wide' },
    { key: '1', label: '1', role: 'control' },
    { key: '2', label: '2', role: 'control' },
    { key: '3', label: '3', role: 'control' },
    { key: '4', label: '4', role: 'control' },
    { key: '5', label: '5', role: 'control' },
    { key: '6', label: '6', role: 'control' },
    { key: '7', label: '7', role: 'control' },
    { key: '8', label: '8', role: 'control' },
    { key: '9', label: '9', role: 'control' },
    { key: '0', label: '0', subLabel: '줄시작', role: 'motion' },
    { key: '-', label: '-' },
    { key: '=', label: '=' },
    { key: 'Backspace', label: '⌫', width: 'wide' },
  ],
  // 2행: QWERTY 상단
  [
    { key: 'Tab', label: 'Tab', width: 'wide' },
    { key: 'q', label: 'q', subLabel: '종료' },
    { key: 'w', label: 'w', subLabel: '단어▶', role: 'motion' },
    { key: 'e', label: 'e', subLabel: '단어끝', role: 'motion' },
    { key: 'r', label: 'r', subLabel: '교체', role: 'operator' },
    { key: 't', label: 't', subLabel: '탐색전', role: 'search' },
    { key: 'y', label: 'y', subLabel: '복사', role: 'operator' },
    { key: 'u', label: 'u', subLabel: '되돌리기', role: 'control' },
    { key: 'i', label: 'i', subLabel: '입력', role: 'insert' },
    { key: 'o', label: 'o', subLabel: '새줄입력', role: 'insert' },
    { key: 'p', label: 'p', subLabel: '붙여넣기', role: 'operator' },
    { key: '[', label: '[' },
    { key: ']', label: ']' },
    { key: '\\', label: '\\' },
  ],
  // 3행: Home row
  [
    { key: 'CapsLock', label: 'Caps', width: 'wide' },
    { key: 'a', label: 'a', subLabel: '뒤입력', role: 'insert' },
    { key: 's', label: 's', subLabel: '치환', role: 'operator' },
    { key: 'd', label: 'd', subLabel: '삭제', role: 'operator' },
    { key: 'f', label: 'f', subLabel: '문자탐색', role: 'search' },
    { key: 'g', label: 'g', subLabel: '이동(gg)', role: 'motion' },
    { key: 'h', label: 'h', subLabel: '◀ 좌', role: 'motion' },
    { key: 'j', label: 'j', subLabel: '▼ 하', role: 'motion' },
    { key: 'k', label: 'k', subLabel: '▲ 상', role: 'motion' },
    { key: 'l', label: 'l', subLabel: '▶ 우', role: 'motion' },
    { key: ';', label: ';', subLabel: ':' },
    { key: "'", label: "'" },
    { key: 'Enter', label: 'Enter ⏎', width: 'extra-wide', role: 'control' },
  ],
  // 4행: 하단
  [
    { key: 'Shift', label: 'Shift', width: 'extra-wide' },
    { key: 'z', label: 'z' },
    { key: 'x', label: 'x', subLabel: '글자삭제', role: 'operator' },
    { key: 'c', label: 'c', subLabel: '수정', role: 'operator' },
    { key: 'v', label: 'v', subLabel: '선택', role: 'visual' },
    { key: 'b', label: 'b', subLabel: '◀단어', role: 'motion' },
    { key: 'n', label: 'n', subLabel: '다음검색', role: 'search' },
    { key: 'm', label: 'm' },
    { key: ',', label: ',' },
    { key: '.', label: '.', subLabel: '반복', role: 'control' },
    { key: '/', label: '/', subLabel: '검색', role: 'search' },
    { key: 'Shift', label: 'Shift', width: 'extra-wide' },
  ],
  // 5행: 스페이스바
  [
    { key: 'Control', label: 'Ctrl', width: 'wide' },
    { key: 'Alt', label: 'Alt', width: 'wide' },
    { key: ' ', label: 'Space', role: 'motion', width: 'space' },
    { key: ':', label: ':', subLabel: '명령어', role: 'search', width: 'wide' },
  ],
];

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  mode,
  lastPressedKey,
  onKeyPress,
}) => {
  const isKeyActive = (keyDefKey: string): boolean => {
    if (!lastPressedKey) return false;
    const lk = lastPressedKey.toLowerCase();
    const k = keyDefKey.toLowerCase();

    if (keyDefKey === ' ' && lastPressedKey === ' ') return true;
    if (keyDefKey === 'Enter' && lastPressedKey === 'Enter') return true;
    if (keyDefKey === 'Escape' && lastPressedKey === 'Escape') return true;
    if (keyDefKey === 'Backspace' && lastPressedKey === 'Backspace') return true;
    if (keyDefKey === ':' && lastPressedKey === ':') return true;
    if (keyDefKey === '/' && lastPressedKey === '/') return true;

    return lk === k;
  };

  const getKeyRoleClass = (keyDef: KeyDef): string => {
    if (!keyDef.role) return '';

    // 모드에 따른 역할 하이라이트 제어
    if (mode === 'NORMAL') {
      return `role-${keyDef.role}`;
    }

    if (mode === 'INSERT') {
      if (keyDef.key === 'Escape') return 'role-control active-mode-key';
      return '';
    }

    if (mode === 'VISUAL' || mode === 'VISUAL_LINE' || mode === 'VISUAL_BLOCK') {
      if (['d', 'y', 'c', 'x', 'I', 'A', 'Escape'].includes(keyDef.key)) {
        return 'role-operator active-mode-key';
      }
      if (keyDef.role === 'motion') {
        return 'role-motion';
      }
      return '';
    }

    return `role-${keyDef.role}`;
  };

  return (
    <div className="virtual-keyboard-panel" data-testid="virtual-keyboard">
      <div className="keyboard-header">
        <div className="keyboard-header-left">
          <span className="keyboard-title">⌨ 인터랙티브 Vim 가상 키보드</span>
          <span className="keyboard-mode-pill">현재 모드: {mode}</span>
        </div>
        <div className="keyboard-legend">
          <span className="legend-item"><span className="legend-dot motion" />이동</span>
          <span className="legend-item"><span className="legend-dot operator" />수정/삭제</span>
          <span className="legend-item"><span className="legend-dot insert" />입력 진입</span>
          <span className="legend-item"><span className="legend-dot visual" />비주얼 선택</span>
          <span className="legend-item"><span className="legend-dot search" />탐색/검색</span>
        </div>
      </div>

      <div className="keyboard-layout" role="grid" aria-label="Virtual Keyboard">
        {KEYBOARD_ROWS.map((row, rIdx) => (
          <div key={`row-${rIdx}`} className="keyboard-row">
            {row.map((keyDef, kIdx) => {
              const active = isKeyActive(keyDef.key);
              const roleClass = getKeyRoleClass(keyDef);
              const widthClass = keyDef.width ? `width-${keyDef.width}` : '';

              return (
                <button
                  key={`key-${rIdx}-${kIdx}-${keyDef.key}`}
                  type="button"
                  className={`vkey ${roleClass} ${widthClass} ${active ? 'vkey-pressed' : ''}`}
                  onClick={() => onKeyPress?.(keyDef.key)}
                  data-testid={`vkey-${keyDef.key}`}
                  title={keyDef.subLabel ? `${keyDef.label}: ${keyDef.subLabel}` : keyDef.label}
                >
                  <span className="vkey-label">{keyDef.label}</span>
                  {keyDef.subLabel && (
                    <span className="vkey-sublabel">{keyDef.subLabel}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VirtualKeyboard;
