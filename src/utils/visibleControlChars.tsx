import React from 'react';
import { controlCharDisplay, isControlChar } from '../vim-engine';

/**
 * 버퍼·레지스터 텍스트 안의 제어 글자(`"ap` 로 붙여 넣은 매크로의 ESC 등)를 Vim 화면처럼 보여 주는 도우미.
 * ESC → `^[`, CR → `^M`, Ctrl-w → `^W`, K_SPECIAL(`\x80`) → `<80>` (Vim `transchar`).
 */

/** 제어 글자가 들어 있는지. */
export function hasControlChars(text: string): boolean {
  for (const ch of text) if (isControlChar(ch)) return true;
  return false;
}

/** 제어 글자를 `^[` 표기로 바꾼 문자열 (줄바꿈은 그대로). */
export function toVisibleControlText(text: string): string {
  let out = '';
  for (const ch of text) out += ch === '\n' ? ch : controlCharDisplay(ch);
  return out;
}

/** `^[`·`^M`·`^W`·`^?`·`<80>` 표기를 실제 제어 글자로 되돌립니다 (toVisibleControlText 의 반대). */
export function fromVisibleControlText(text: string): string {
  return text
    .replace(/<80>/g, '\x80')
    .replace(/\^\?/g, '\x7f')
    .replace(/\^([@A-Z[\\\]^_])/g, (_m, c: string) => String.fromCharCode(c.charCodeAt(0) - 0x40));
}

/** 제어 글자를 `^[` 로 바꾸고 에디터와 같은 SpecialKey 색(`.special-key-char`)으로 감싸 렌더링합니다. */
export function renderVisibleControlText(text: string): React.ReactNode {
  if (!hasControlChars(text)) return text;
  const parts: React.ReactNode[] = [];
  let plain = '';
  let idx = 0;
  for (const ch of text) {
    if (isControlChar(ch)) {
      if (plain) parts.push(plain);
      plain = '';
      parts.push(
        <span key={idx} className="special-key-char" data-testid="special-key-char">
          {controlCharDisplay(ch)}
        </span>
      );
    } else {
      plain += ch;
    }
    idx++;
  }
  if (plain) parts.push(plain);
  return parts;
}
