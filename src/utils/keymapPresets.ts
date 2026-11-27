import { localized } from '../i18n';

/** 기본 키매핑 프리셋 (앱 시작 시 keymapStorage 가 쓰므로 설정 내보내기 생성기와 분리) */
export interface KeymapPreset {
  id: string;
  title: string;
  description: string;
  mode: 'insert' | 'normal';
  from: string;
  to: string;
  defaultActive: boolean;
}

export const DEFAULT_KEYMAP_PRESETS: KeymapPreset[] = localized([
  {
    id: 'jkEsc',
    title: 'jk -> <Esc>',
    description: 'Insert 모드에서 홈 포지션을 벗어나지 않고 빠르게 Normal 모드로 복귀합니다.',
    mode: 'insert',
    from: 'jk',
    to: '<Esc>',
    defaultActive: true,
  },
  {
    id: 'jjEsc',
    title: 'jj -> <Esc>',
    description: 'Insert 모드에서 j를 두 번 연타하여 즉시 Normal 모드로 복귀합니다.',
    mode: 'insert',
    from: 'jj',
    to: '<Esc>',
    defaultActive: false,
  },
  {
    id: 'leaderW',
    title: '<Space>w -> :w (빠른 저장)',
    description: '스페이스바(리더 키) + w로 버퍼를 즉시 저장합니다.',
    mode: 'normal',
    from: '<leader>w',
    to: ':w',
    defaultActive: true,
  },
  {
    id: 'leaderQ',
    title: '<Space>q -> :q (빠른 종료/창 닫기)',
    description: '스페이스바(리더 키) + q로 현재 파일이나 분할 창을 즉시 닫습니다.',
    mode: 'normal',
    from: '<leader>q',
    to: ':q',
    defaultActive: true,
  },
  {
    id: 'hlLineMove',
    title: 'H -> ^, L -> $ (줄 시작/끝 고속 점프)',
    description: '대문자 H로 첫 글자(^), 대문자 L로 줄 끝($)으로 즉시 점프합니다.',
    mode: 'normal',
    from: 'H',
    to: '^',
    defaultActive: true,
  },
  {
    id: 'ctrlWindowNav',
    title: 'Ctrl+h/j/k/l -> 창 분할 이동',
    description: 'Ctrl+w 조합 없이 Ctrl+h/j/k/l만으로 분할 창 사이를 즉시 이동합니다.',
    mode: 'normal',
    from: 'Ctrl-h',
    to: 'Ctrl-w h',
    defaultActive: true,
  },
  {
    id: 'leaderBlackhole',
    title: '<Space>d -> "_d (블랙홀 레지스터 삭제)',
    description: '기존 복사(Yank) 레지스터를 보존한 채 삭제를 수행합니다.',
    mode: 'normal',
    from: '<leader>d',
    to: '"_d',
    defaultActive: false,
  },
]);
