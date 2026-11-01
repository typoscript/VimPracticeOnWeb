import { DungeonStage, DungeonSkill } from '../types/dungeon';

export const DUNGEON_SKILLS: Record<string, DungeonSkill> = {
  basic_move: {
    id: 'basic_move',
    name: '기본 보행',
    keys: ['h', 'j', 'k', 'l'],
    icon: '👟',
    description: '던전의 바닥 타일을 1칸씩 신중하게 걷습니다.',
  },
  basic_slash: {
    id: 'basic_slash',
    name: '기본 타격 (x)',
    keys: ['x'],
    icon: '🗡️',
    description: '눈앞의 장애물이나 균열된 바위를 1문자 파괴합니다.',
  },
  word_boots: {
    id: 'word_boots',
    name: '바람의 도약 부츠 (w/b/e)',
    keys: ['w', 'b', 'e'],
    icon: '🥾',
    description: '물웅덩이나 함정을 단어 단위로 뛰어넘어 건너편 섬으로 착지합니다.',
  },
  find_hook: {
    id: 'find_hook',
    name: '갈고리 앵커 (f/t)',
    keys: ['f', 't', 'F', 'T', ';', ','],
    icon: '⚓',
    description: '원거리 타겟 문자를 조준하여 단숨에 목표 지점으로 끌어당겨 이동합니다.',
  },
  bracket_portal: {
    id: 'bracket_portal',
    name: '차원 괄호 포탈 (%)',
    keys: ['%'],
    icon: '🌀',
    description: '대응되는 짝 괄호(( ), [ ], { }) 사이의 허공을 워프하여 순간이동합니다.',
  },
  alchemy_bridge: {
    id: 'alchemy_bridge',
    name: '복제 연금술 (y/p)',
    keys: ['y', 'p', 'yiw', 'yw'],
    icon: '📜',
    description: '다른 곳의 다리 블록을 복사(Yank)하여 끊어진 심연에 붙여넣어(Put) 길을 만듭니다.',
  },
  wand_textobj: {
    id: 'wand_textobj',
    name: '텍스트 객체 마법봉 (di"/da()',
    keys: ['di"', 'ci"', 'da(', 'di('],
    icon: '🪄',
    description: '따옴표 내부의 몬스터 핵을 소멸시키거나 보호막 통째로 산산조각냅니다.',
  },
};

export const DUNGEON_STAGES: DungeonStage[] = [
  // =========================================================================
  // Stage 1: 침묵의 미로 (Labyrinth of Silence)
  // =========================================================================
  {
    id: 1,
    title: 'Stage 1: 침묵의 미로',
    subtitle: 'The Labyrinth of Silence',
    description:
      'Vim 던전의 첫 번째 관문입니다. h, j, k, l 로 미로를 탐험하고, 길을 막고 있는 균열된 바위(X)를 x 로 부순 뒤 황금 열쇠(K)를 얻어 출구(E)로 향하세요.',
    hint: 'h/j/k/l로 1칸씩 걷고, X 위치에서 x 키를 누르면 바위가 부서집니다.',
    initialLines: [
      '#######',
      '#@.X..#',
      '###.#.#',
      '#K..#.#',
      '#.###.#',
      '#...D.E',
      '#######',
    ],
    initialCursor: { line: 1, col: 1 },
    tileMap: [
      '#######',
      '#.M...#',
      '###.#.#',
      '#K..#.#',
      '#.###.#',
      '#...D.E',
      '#######',
    ],
    allowedKeys: ['h', 'j', 'k', 'l', 'x', 'Escape'],
    newSkillUnlocked: DUNGEON_SKILLS.word_boots,
    par: 18,
    objective: '바위(X)를 x로 부수고, 열쇠(K)를 획득하여 문(D)을 열고 탈출(E)하세요.',
  },

  // =========================================================================
  // Stage 2: 군도와 징검다리 (Island Archipelago)
  // =========================================================================
  {
    id: 2,
    title: 'Stage 2: 군도와 징검다리',
    subtitle: 'The Island Archipelago',
    description:
      '깊은 지하 호수에 가로막혀 걸어서는 건널 수 없습니다. 새로 얻은 [바람의 도약 부츠(w/b/e)]를 신고, 물 위에 솟은 단어 섬들을 징검다리 삼아 뛰어넘으세요!',
    hint: 'h, j, k, l로는 깊은 물(~)을 건널 수 없습니다. w와 b, e 단어 점프를 활용하세요.',
    initialLines: [
      '#@~~~~~~~#',
      '#ISLE~~~~#',
      '#~~~~ROCK#',
      '#~~KEY~~~#',
      '#~~~~GATE#',
      '#~~~~~~D.E',
      '##########',
    ],
    initialCursor: { line: 0, col: 1 },
    tileMap: [
      '#.~~~~~~~#',
      '#....~~~~#',
      '#~~~~....#',
      '#~~K..~~~#',
      '#~~~~....#',
      '#~~~~~~D.E',
      '##########',
    ],
    allowedKeys: ['h', 'j', 'k', 'l', 'w', 'b', 'e', 'x', 'Escape'],
    newSkillUnlocked: DUNGEON_SKILLS.find_hook,
    par: 14,
    objective: '물(~)을 건너뛸 수 있는 w/b/e 부츠로 단어 섬들을 밟아 열쇠를 얻고 문(D)을 여세요.',
  },

  // =========================================================================
  // Stage 3: 차원 괄호 포탈 (The Bracket Portal Caverns)
  // =========================================================================
  {
    id: 3,
    title: 'Stage 3: 차원 괄호 포탈',
    subtitle: 'The Bracket Portal Caverns',
    description:
      '허공에 고립된 부유석들 사이에 고대 괄호 포탈이 켜져 있습니다. f( 로 괄호에 착지한 뒤 % 포탈 점프로 반대편 닫힌 괄호 ) 로 공간을 워프하세요!',
    hint: 'f( 로 괄호에 커서를 둔 뒤, % 를 누르면 반대쪽 괄호로 단숨에 워프합니다.',
    initialLines: [
      '#@..~~~~~~~~~#',
      '#..(START)~~~#',
      '#~~~~~~~~~~~~#',
      '#~~~[PORTAL]~#',
      '#~~~~~~~~~~~~#',
      '#~~KEY~~(END)#',
      '#~~~~~D.E####',
    ],
    initialCursor: { line: 0, col: 1 },
    tileMap: [
      '#...~~~~~~~~~#',
      '#..((....)~~~#',
      '#~~~~~~~~~~~~#',
      '#~~~[......]~#',
      '#~~~~~~~~~~~~#',
      '#~~K..((...))#',
      '#~~~~~D.E####',
    ],
    allowedKeys: ['h', 'j', 'k', 'l', 'w', 'b', 'e', 'f', 't', 'F', 'T', '%', 'x', 'Escape'],
    newSkillUnlocked: DUNGEON_SKILLS.alchemy_bridge,
    par: 14,
    objective: '괄호 포탈(%)을 타고 허공을 순간이동하여 열쇠를 획득하고 출구로 도달하세요.',
  },

  // =========================================================================
  // Stage 4: 끊어진 심연과 연금술 다리 (The Broken Chasm)
  // =========================================================================
  {
    id: 4,
    title: 'Stage 4: 끊어진 심연과 연금술 다리',
    subtitle: 'The Broken Chasm & Alchemy Bridge',
    description:
      '신전으로 향하는 길이 거대한 심연(____)으로 끊어져 있습니다. 좌측 창고의 [BRIDGE] 석재를 yiw로 복사(Yank)한 뒤, 끊어진 자리에 p(Put)로 다리를 건설하세요!',
    hint: 'BRIDGE 단어 위에서 yiw를 누른 뒤, 심연 틈새로 가서 p를 누르면 목재 다리가 복원됩니다.',
    initialLines: [
      '###############',
      '#@..#...BRIDGE#',
      '#...#.........#',
      '#####___#######',
      '#..K....#..D.E#',
      '###############',
    ],
    initialCursor: { line: 1, col: 1 },
    tileMap: [
      '###############',
      '#...#.........#',
      '#...#.........#',
      '#####___#######',
      '#..K....#..D.E#',
      '###############',
    ],
    allowedKeys: [
      'h',
      'j',
      'k',
      'l',
      'w',
      'b',
      'e',
      'f',
      't',
      '%',
      'y',
      'p',
      'i',
      'w',
      'x',
      'Escape',
    ],
    newSkillUnlocked: DUNGEON_SKILLS.wand_textobj,
    par: 18,
    objective: 'yiw로 다리(BRIDGE)를 복사하고, 심연(____)에서 p로 다리를 놓아 통과하세요.',
  },

  // =========================================================================
  // Stage 5: 버그 로드의 둥지 (Lair of the Bug Lord - Boss Battle)
  // =========================================================================
  {
    id: 5,
    title: 'Stage 5: 버그 로드의 둥지 (보스전)',
    subtitle: 'Lair of the Bug Lord',
    description:
      '던전의 최종 보스 [버그 로드]가 2중 보호막(("BUG_LORD"))을 두르고 있습니다! f" 로 접근해 di" 로 보스의 핵을 소멸시키고, da( 로 외벽 쉴드를 파괴하여 왕국을 구원하세요!',
    hint: 'f" 로 따옴표로 점프한 뒤 di" 로 핵을 없애고, da( 로 괄호 보호막을 통째로 분쇄하세요.',
    initialLines: [
      '#################',
      '#@..............#',
      '#..("BUG_LORD").#',
      '#...............#',
      '#..KEY..........#',
      '#..........D..E.#',
      '#################',
    ],
    initialCursor: { line: 1, col: 1 },
    tileMap: [
      '#################',
      '#...............#',
      '#..("........").#',
      '#...............#',
      '#..K............#',
      '#..........D..E.#',
      '#################',
    ],
    allowedKeys: [
      'h',
      'j',
      'k',
      'l',
      'w',
      'b',
      'e',
      'f',
      't',
      '%',
      'x',
      'd',
      'c',
      'y',
      'p',
      'i',
      'a',
      '"',
      '(',
      ')',
      'Escape',
    ],
    bossEntity: {
      line: 2,
      col: 3,
      text: '("BUG_LORD")',
      shieldType: 'double',
    },
    par: 12,
    objective: '보스의 핵을 di"로 격파하고, da(로 잔여 쉴드를 깨뜨려 던전 마스터 칭호를 획득하세요!',
  },
];
