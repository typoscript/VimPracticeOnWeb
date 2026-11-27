/**
 * 창·탭·버퍼·매크로·Undo·UI 클릭 조합 퍼즈 하네스 (windowBuffer.fuzz.test.ts 에서 사용).
 *
 * 각 동작은 다시 실행할 수 있는 라벨(예: ':vsp', 'UI:switchTab#2', 'RT')로 표현해
 * 실패 시 `minimize` 로 가장 짧은 재현 순서를 얻을 수 있습니다.
 * 검사 항목
 * - devChecks 불변성 (UI 직접 호출 뒤에도 `assertValidVimState` 실행)
 * - RT: `:e 다른파일` → `Ctrl-^` 왕복 후 원래 파일의 줄·소문자 마크·폴드가 그대로인지
 * - XU: `x` → `u` 가 내용을 원래대로 되돌리는지
 * - 매 단계 `getReturnToNormalKeys` 로 UI 버튼을 받을 수 있는 상태가 되는지
 */
import * as E from '../src/vim-engine';
import type { VimEditorState } from '../src/vim-engine';
import { getReturnToNormalKeys, isReadyForUiKeys } from '../src/utils/returnToNormalKeys';
const A = E as any;

export function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
export const EX = ['vsp','sp','close','only','tabnew','tabnext','tabclose','e b.ts','e src/c.ts','bn','bp','b1','Oil','ToggleTerm','Neotree','help gv','Explore','q','copen','cn','vimgrep /foo/ *','HarpoonMenu','undo 1','earlier 2','later 1','s/foo/bar/','g/foo/d','normal! x','2,3fold','windo set nu','bufdo set et'];
export const KEYS = ['h','j','k','l','w','x','dd','u','Ctrl-r','g-','g+','i','a','o','Escape','v','V','zf','za','zo','gv','g;','ma',"'a",'mA',"'A",'Ctrl-^','Ctrl-o','Ctrl-i','.','qa','q','@a','@@','yy','p','Ctrl-w w','Ctrl-w v','Ctrl-w c','Ctrl-w o','gt','gT','*','n','J','>>','g Ctrl-n','Enter','Tab'];
export const UI = ['switchBuffer','deleteBuffer','paneFocus','switchTab','openNewTab','closeTab','qfJump','neotreeOpen'];
const tok = (t: string): string[] => t === 'g Ctrl-n' ? ['g','Ctrl-n'] : t.startsWith('Ctrl-w ') ? ['Ctrl-w', t.slice(7)] : t.startsWith('Ctrl-') || ['Escape','Enter','Tab'].includes(t) ? [t] : t.split('');
const special = (s: VimEditorState) => s.terminalSession?.isOpen || s.oilSession?.isOpen || s.netrw?.isOpen || s.helpSession?.isOpen;
const localMarks = (s: VimEditorState) => JSON.stringify(Object.fromEntries(Object.entries(s.marks ?? {}).filter(([k]) => /^[a-z]$/.test(k))));

export function init(): VimEditorState {
  return { ...A.createVimState(['const foo = 1;', 'foo(a, b);', 'if (x) { y(); }', 'TODO: fix foo', ''], { line: 0, col: 0 }), primaryFilename: 'a.ts',
    virtualFiles: { 'a.ts': ['const foo = 1;'], 'b.ts': ['b1', 'b2 foo', 'b3'], 'src/c.ts': ['c1 foo', 'c2'] } };
}

export function genLabel(r: () => number): string {
  const roll = r();
  if (roll < 0.18) return ':' + EX[Math.floor(r() * EX.length)];
  if (roll < 0.3) return 'UI:' + UI[Math.floor(r() * UI.length)] + '#' + Math.floor(r() * 4);
  if (roll < 0.36) return 'RT';
  if (roll < 0.4) return 'XU';
  return KEYS[Math.floor(r() * KEYS.length)];
}

/** 라벨 하나 실행. 실패 시그니처를 반환 (없으면 null) */
export function step(s: VimEditorState, label: string): { s: VimEditorState; fail: string | null } {
  try {
    if (label.startsWith(':')) { for (const k of [':', ...label.slice(1).split(''), 'Enter']) s = A.handleKey(s, k); }
    else if (label.startsWith('UI:')) {
      const [name, nStr] = label.slice(3).split('#'); const n = Number(nStr);
      const x = s; A.deepFreeze(x);
      let next = x;
      const b = x.buffers ?? []; const tabs = (x as any).tabs ?? [];
      if (name === 'switchBuffer' && b.length) next = A.switchBuffer(x, b[n % b.length].id);
      if (name === 'deleteBuffer' && b.length > 1) next = A.deleteBuffer(x, String(b[n % b.length].id), true);
      if (name === 'paneFocus' && x.splitPanes?.length) next = A.switchPaneFocus(x, n % x.splitPanes.length);
      if (name === 'switchTab' && tabs.length) next = A.switchTab(x, tabs[n % tabs.length].id);
      if (name === 'openNewTab') next = A.openNewTab(x);
      if (name === 'closeTab') next = A.closeTab(x);
      if (name === 'qfJump' && (x as any).quickfixList?.length) next = A.jumpToQuickfixItem(x, 0);
      if (name === 'neotreeOpen' && x.neotree?.isOpen) next = A.openNeotreeNode(x, n);
      next = A.syncPerFileState(x, next);
      A.assertValidVimState(x, next, label);
      s = next;
    } else if (label === 'RT') {
      if (isReadyForUiKeys(s) && !special(s)) {
        const file = s.primaryFilename; const lines = JSON.stringify(s.lines); const marks = localMarks(s); const folds = JSON.stringify(s.folds ?? []);
        let t = s;
        for (const k of [':', ...'e zz.ts'.split(''), 'Enter', 'Ctrl-^']) t = A.handleKey(t, k);
        if (t.primaryFilename !== file) return { s, fail: `roundtrip-file` };
        if (JSON.stringify(t.lines) !== lines) return { s, fail: 'roundtrip-lines' };
        if (localMarks(t) !== marks) return { s, fail: 'roundtrip-marks' };
        if (JSON.stringify(t.folds ?? []) !== folds) return { s, fail: 'roundtrip-folds' };
      }
    } else if (label === 'XU') {
      if (isReadyForUiKeys(s) && !special(s) && (s.lines[s.cursor.line] ?? '').length > 0) {
        const before = JSON.stringify(s.lines);
        let t = A.handleKey(s, 'x');
        if (JSON.stringify(t.lines) !== before) { t = A.handleKey(t, 'u'); if (JSON.stringify(t.lines) !== before) return { s, fail: 'undo-mismatch' }; }
      }
    } else { for (const k of tok(label)) s = A.handleKey(s, k); }
    const ks = getReturnToNormalKeys(s); let u = s; for (const k of ks) u = A.handleKey(u, k);
    if (!isReadyForUiKeys(u)) return { s, fail: `not-ready mode=${u.mode}` };
    return { s, fail: null };
  } catch (e) { return { s, fail: String((e as Error).message).replace(/\(.*$/, '').replace(/\d+/g, 'N').replace(/'[^']*'/g, "'_'").slice(0, 90) }; }
}

export function runTrace(labels: string[]): string | null {
  let s = init();
  for (const l of labels) { const res = step(s, l); if (res.fail) return res.fail; s = res.s; }
  return null;
}

export function minimize(labels: string[], sig: string): string[] {
  let cur = labels; let changed = true; let budget = 600;
  while (changed && budget > 0) { changed = false;
    for (let i = 0; i < cur.length; i++) { if (--budget <= 0) break; const t = [...cur.slice(0, i), ...cur.slice(i + 1)]; if (runTrace(t) === sig) { cur = t; changed = true; break; } } }
  return cur;
}
