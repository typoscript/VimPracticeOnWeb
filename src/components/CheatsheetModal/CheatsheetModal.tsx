import React, { useMemo, useState } from 'react';
import { t, i18nKey } from '../../i18n';
import './CheatsheetModal.css';

export type CheatsheetCategoryId =
  | 'all'
  | 'motion'
  | 'edit'
  | 'textobject'
  | 'search'
  | 'window'
  | 'neovim';

export interface CheatsheetItem {
  id: string;
  category: Exclude<CheatsheetCategoryId, 'all'>;
  keys: string;
  titleKey: string;
  descKey: string;
  tryKeys: readonly string[];
}

export const CHEATSHEET_CATEGORIES: ReadonlyArray<{
  id: CheatsheetCategoryId;
  labelKey: string;
}> = [
  { id: 'all', labelKey: i18nKey('전체') },
  { id: 'motion', labelKey: i18nKey('모션 · 탐색') },
  { id: 'edit', labelKey: i18nKey('편집 · 연산자') },
  { id: 'textobject', labelKey: i18nKey('텍스트 객체 · 서라운드') },
  { id: 'search', labelKey: i18nKey('검색 · 치환') },
  { id: 'window', labelKey: i18nKey('버퍼 · 창 · 터미널') },
  { id: 'neovim', labelKey: i18nKey('모던 Neovim · LSP · Git') },
];

export const CHEATSHEET_ITEMS: ReadonlyArray<CheatsheetItem> = [
  {
    id: 'word-motions',
    category: 'motion',
    keys: 'w / b / e / ge',
    titleKey: i18nKey('단어 시작·끝 이동'),
    descKey: i18nKey('다음 단어 시작(w), 이전 단어 시작(b), 단어 끝(e), 이전 단어 끝(ge)으로 점프합니다.'),
    tryKeys: ['Escape', 'w'],
  },
  {
    id: 'line-bounds',
    category: 'motion',
    keys: '0 / ^ / $ / _ / g^ / g_',
    titleKey: i18nKey('줄 시작·첫 비공백·끝 이동'),
    descKey: i18nKey('줄 맨 앞(0), 첫 비공백(^, _, g^), 마지막 비공백(g_), 줄 끝($)으로 이동합니다.'),
    tryKeys: ['Escape', '_'],
  },
  {
    id: 'char-find',
    category: 'motion',
    keys: 'f{c} / t{c} / ; / ,',
    titleKey: i18nKey('줄 내 문자 탐색 및 반복'),
    descKey: i18nKey('줄 안에서 대상 문자 위(f)나 직전(t)으로 점프하고 ; / , 로 순방향·역방향 반복합니다.'),
    tryKeys: ['Escape', 'f', '('],
  },
  {
    id: 'bracket-nav',
    category: 'motion',
    keys: "]' / [' / [/ / ]/ / [I",
    titleKey: i18nKey('소문자 마크 · 주석 경계 · 키워드 줄 탐색'),
    descKey: i18nKey("다음·이전 소문자 마크(]'/['), 블록 주석 경계([//]/), 커서 단어 포함 줄 전체 조회([I)를 수행합니다."),
    tryKeys: ['Escape', '[', 'I'],
  },
  {
    id: 'flash-jump',
    category: 'motion',
    keys: 'gs / dgs / cgs',
    titleKey: i18nKey('flash.nvim 화면 라벨 순간이동'),
    descKey: i18nKey('검색 문자 + 홈로우 라벨 한 타로 화면 어디든 점프하거나 원격 삭제(dgs)·수정(cgs)합니다.'),
    tryKeys: ['Escape', 'g', 's'],
  },
  {
    id: 'count-edit',
    category: 'edit',
    keys: '[N]i / [N]s / [N]D / [N]C / d_',
    titleKey: i18nKey('카운트 반복 삽입 & 줄 단위 편집'),
    descKey: i18nKey('N번 텍스트 반복 삽입([N]i/A/o), N글자 교체([N]s), N줄 끝까지 삭제·변경([N]D/[N]C), 줄 삭제(d_)를 수행합니다.'),
    tryKeys: ['Escape', '3', 'A', '!', 'Escape'],
  },
  {
    id: 'dial-toggle',
    category: 'edit',
    keys: 'Ctrl-a / Ctrl-x',
    titleKey: i18nKey('dial.nvim 스마트 값 · 날짜 · 연산자 증감'),
    descKey: i18nKey('숫자뿐 아니라 true↔false, YYYY-MM-DD 날짜, ===↔!==, &&↔||, const↔let 을 한 타로 증감·토글합니다.'),
    tryKeys: ['Escape', 'Ctrl-a'],
  },
  {
    id: 'abolish-case',
    category: 'edit',
    keys: 'crc / crs / crm / cru',
    titleKey: i18nKey('vim-abolish 식별자 케이스 즉시 변환'),
    descKey: i18nKey('커서 아래 단어를 camelCase(crc), snake_case(crs), PascalCase(crm), UPPER_SNAKE(cru)로 즉시 변환합니다.'),
    tryKeys: ['Escape', 'c', 'r', 'c'],
  },
  {
    id: 'treesj-split',
    category: 'edit',
    keys: 'gS / :TSJToggle',
    titleKey: i18nKey('treesj 구조적 Split / Join'),
    descKey: i18nKey('객체·배열·인자 블록({...}, [...], (...))을 한 줄 ↔ 멀티라인으로 즉시 분할·병합합니다.'),
    tryKeys: ['Escape', 'g', 'S'],
  },
  {
    id: 'mini-move',
    category: 'edit',
    keys: 'Alt-j / Alt-k / Alt-h / Alt-l',
    titleKey: i18nKey('mini.move 줄 · 선택 블록 4방향 이동'),
    descKey: i18nKey('현재 줄이나 Visual 선택 블록을 위아래로 스왑하거나 좌우 들여쓰기를 즉시 이동합니다.'),
    tryKeys: ['Escape', 'Alt-j'],
  },
  {
    id: 'inner-objects',
    category: 'textobject',
    keys: 'ciw / ci" / ci( / cit / dip / dii',
    titleKey: i18nKey('단어 · 따옴표 · 괄호 · 태그 · 문단 · 인덴트 객체'),
    descKey: i18nKey('커서가 블록 어디에 있든 내부(i) 또는 전체(a) 범위를 한 번에 삭제·수정·복사합니다.'),
    tryKeys: ['Escape', 'v', 'i', 'w'],
  },
  {
    id: 'mini-ai',
    category: 'textobject',
    keys: 'cin" / din( / cil"',
    titleKey: i18nKey('mini.ai Next(n) / Last(l) 원격 텍스트 객체'),
    descKey: i18nKey('커서를 옮기지 않고 다음(in/an) 또는 이전(il/al) 따옴표·괄호 쌍을 원격으로 즉시 편집합니다.'),
    tryKeys: ['Escape', 'v', 'i', 'n', '"'],
  },
  {
    id: 'treesitter-obj',
    category: 'textobject',
    keys: 'daf / cif / daa / ]f / [f',
    titleKey: i18nKey('Treesitter 함수(af/if) · 매개변수(aa/ia) 객체'),
    descKey: i18nKey('함수 전체(daf)·함수 본문(cif)·인자(daa)를 구조적으로 조작하고 ]f / [f 로 함수 간 점프합니다.'),
    tryKeys: ['Escape', ']', 'f'],
  },
  {
    id: 'vim-surround',
    category: 'textobject',
    keys: 'ysiw" / cs"\' / ds" / S)',
    titleKey: i18nKey('vim-surround 괄호·따옴표 감싸기/교체/삭제'),
    descKey: i18nKey('단어를 기호로 감싸거나(ysiw), 기존 기호를 바꾸고(cs), 기호만 벗겨냅니다(ds).'),
    tryKeys: ['Escape', 'y', 's', 'i', 'w', '"'],
  },
  {
    id: 'search-cgn',
    category: 'search',
    keys: '* / # / cgn / .',
    titleKey: i18nKey('커서 단어 검색 & cgn 연속 치환'),
    descKey: i18nKey('* 로 커서 단어를 검색하고 cgn 으로 첫 매치를 바꾼 뒤 . 연타로 선택적 치환을 이어갑니다.'),
    tryKeys: ['Escape', '*'],
  },
  {
    id: 'sub-expr',
    category: 'search',
    keys: ':%s/old/new/g / :%s//\\=submatch(0)/g',
    titleKey: i18nKey('범위 정규식 치환 & 계산식(\\=) 치환'),
    descKey: i18nKey('버퍼 전체 치환(:%s), 확인 치환(gc), Vimscript 표현식(\\=expr) 계산 치환을 수행합니다.'),
    tryKeys: ['Escape', ...':LiveGrep'.split(''), 'Enter'],
  },
  {
    id: 'spectre-replace',
    category: 'search',
    keys: ':Spectre [검색] [치환] / :SpectreApply',
    titleKey: i18nKey('nvim-spectre 멀티파일 Diff 미리보기 치환'),
    descKey: i18nKey('프로젝트 전체 파일의 검색·치환 결과를 인라인 Diff로 미리 보고 한 번에 반영합니다.'),
    tryKeys: ['Escape', ...':Spectre'.split(''), 'Enter'],
  },
  {
    id: 'windows-buffers',
    category: 'window',
    keys: ':vsp / Ctrl-w hjkl / :bn / Ctrl-^',
    titleKey: i18nKey('창 분할 · 포커스 이동 · 대안 버퍼 전환'),
    descKey: i18nKey('수평(:sp)·수직(:vsp) 분할 창을 넘나들고 직전 버퍼(Ctrl-^)로 1타에 복귀합니다.'),
    tryKeys: ['Escape', 'Ctrl-^'],
  },
  {
    id: 'oil-harpoon',
    category: 'window',
    keys: ':Oil / :HarpoonAdd / :HarpoonMenu',
    titleKey: i18nKey('oil.nvim 파일시스템 버퍼 & Harpoon 파일 핀'),
    descKey: i18nKey('디렉터리를 일반 버퍼처럼 편집(:Oil)하고, 핵심 파일을 핀에 고정(:HarpoonMenu)해 숫자 키로 전환합니다.'),
    tryKeys: ['Escape', ...':HarpoonMenu'.split(''), 'Enter'],
  },
  {
    id: 'toggle-term',
    category: 'window',
    keys: ':ToggleTerm / Ctrl-\\ Ctrl-n',
    titleKey: i18nKey('내장 분할 터미널 & 출력 NORMAL 복사'),
    descKey: i18nKey('하단 가상 터미널에서 명령을 실행하고 Ctrl-\\ Ctrl-n 으로 출력을 일반 버퍼처럼 복사합니다.'),
    tryKeys: ['Escape', ...':ToggleTerm'.split(''), 'Enter'],
  },
  {
    id: 'lsp-actions',
    category: 'neovim',
    keys: 'K / gra / grn / grr / gO / ]d',
    titleKey: i18nKey('Neovim 0.11 표준 LSP 탐색 · 리팩토링'),
    descKey: i18nKey('호버 문서(K), 코드 액션(gra), 심볼 이름 변경(grn), 참조 검색(grr), 심볼 아웃라인(gO)을 실행합니다.'),
    tryKeys: ['Escape', 'g', 'O'],
  },
  {
    id: 'cmp-luasnip',
    category: 'neovim',
    keys: 'Ctrl-Space / fn<Tab> / :set ap',
    titleKey: i18nKey('nvim-cmp 통합 자동완성 · LuaSnip · Autopairs'),
    descKey: i18nKey('Insert 모드에서 스니펫·LSP 심볼·버퍼 단어를 통합 완성(Ctrl-Space)하고 탭스톱을 순환합니다.'),
    tryKeys: ['Escape', ...':Snippets'.split(''), 'Enter'],
  },
  {
    id: 'git-fugitive',
    category: 'neovim',
    keys: ':Git / :Gblame / ]h / :Gitsigns',
    titleKey: i18nKey('vim-fugitive 인터랙티브 Git 패널 & Gitsigns'),
    descKey: i18nKey('Hunk 점프(]h)·스테이징·인라인 Blame(:Gblame)·인터랙티브 커밋 패널(:Git)을 제어합니다.'),
    tryKeys: ['Escape', ...':Git'.split(''), 'Enter'],
  },
  {
    id: 'visual-plugins',
    category: 'neovim',
    keys: ':set noice / :TSContextToggle / :ColorizerToggle',
    titleKey: i18nKey('모던 Neovim 시각 플러그인 스위트'),
    descKey: i18nKey('플로팅 Cmdline(noice), Sticky Scope(tscontext), 컬러 프리뷰(colorizer), 심볼 강조(illuminate), 미니맵(satellite)을 제어합니다.'),
    tryKeys: ['Escape', ...':TSContextToggle'.split(''), 'Enter'],
  },
];

export interface CheatsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteKeys?: (keys: readonly string[]) => void;
}

export const CheatsheetModal: React.FC<CheatsheetModalProps> = ({
  isOpen,
  onClose,
  onExecuteKeys,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<CheatsheetCategoryId>('all');

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return CHEATSHEET_ITEMS.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      const title = t(item.titleKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      const keys = item.keys.toLowerCase();
      return keys.includes(q) || title.includes(q) || desc.includes(q);
    });
  }, [searchQuery, category]);

  if (!isOpen) return null;

  return (
    <div
      className="cheatsheet-modal-backdrop"
      data-testid="cheatsheet-modal"
      onClick={onClose}
    >
      <div
        className="cheatsheet-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cheatsheet-modal-header">
          <div className="cheatsheet-title-wrap">
            <span className="cheatsheet-icon">📖</span>
            <div>
              <h2 className="cheatsheet-title">
                {t('인터랙티브 Vim · Neovim 단축키 치트시트')}
              </h2>
              <p className="cheatsheet-subtitle">
                {t('단축키나 기능을 검색하고 [▶ 실행] 버튼으로 현재 에디터에서 즉시 체험해 보세요 (:Cheatsheet)')}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="cheatsheet-close-btn"
            data-testid="cheatsheet-close-btn"
            onClick={onClose}
            aria-label={t('닫기')}
          >
            ✕
          </button>
        </div>

        <div className="cheatsheet-toolbar">
          <input
            type="text"
            className="cheatsheet-search-input"
            data-testid="cheatsheet-search-input"
            placeholder={t('단축키, 명령, 플러그인 검색 (예: cgn, gs, :Git, treesj, ]\' ...)')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <div className="cheatsheet-categories" role="tablist">
            {CHEATSHEET_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`cheatsheet-cat-btn ${category === cat.id ? 'active' : ''}`}
                data-testid={`cheatsheet-cat-${cat.id}`}
                onClick={() => setCategory(cat.id)}
              >
                {t(cat.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="cheatsheet-grid" data-testid="cheatsheet-grid">
          {filteredItems.length === 0 ? (
            <div className="cheatsheet-empty" data-testid="cheatsheet-empty">
              {t('일치하는 단축키 항목이 없습니다.')}
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className={`cheatsheet-card cat-${item.category}`}
                data-testid={`cheatsheet-card-${item.id}`}
              >
                <div className="cheatsheet-card-top">
                  <code className="cheatsheet-keys">{item.keys}</code>
                  {onExecuteKeys && (
                    <button
                      type="button"
                      className="cheatsheet-try-btn"
                      data-testid={`cheatsheet-try-${item.id}`}
                      onClick={() => {
                        onClose();
                        onExecuteKeys(item.tryKeys);
                      }}
                      title={t('현재 에디터에서 즉시 실행')}
                    >
                      ▶ {t('실행')}
                    </button>
                  )}
                </div>
                <div className="cheatsheet-card-title">{t(item.titleKey)}</div>
                <div className="cheatsheet-card-desc">{t(item.descKey)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CheatsheetModal;
