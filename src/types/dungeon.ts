import { CursorPosition } from './vim';

export type DungeonTileType =
  | 'wall'     // '#' 벽 (보행/점프 불가)
  | 'floor'    // '.' 평지/바닥 (보행 가능)
  | 'water'    // '~' 깊은 강물 (보행 불가, w/b/e나 f, % 점프로만 횡단 가능)
  | 'gap'      // '_' 낭떠러지/심연 (다리 건설 p로 복구 가능)
  | 'bridge'   // '=' 목재 다리 (보행 가능)
  | 'door'     // 'D' 잠긴 문 (열쇠 획득 시 열림)
  | 'exit'     // 'E' 스테이지 출구 포탈
  | 'key'      // 'K' 열쇠 아이템
  | 'chest'    // 'C' 보물 상자
  | 'monster'; // 'M' 버그 몬스터 / 보스

export interface DungeonSkill {
  id: string;
  name: string;
  keys: string[];
  icon: string;
  description: string;
}

export interface DungeonStage {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  hint: string;
  initialLines: string[];
  initialCursor: CursorPosition;
  tileMap: string[]; // 각 행의 타일 속성 오버레이 (#, ., ~, _, D, E, K, C, M)
  allowedKeys: string[]; // 본 스테이지에서 사용 가능한 키 (잠긴 키 누를 시 알림)
  newSkillUnlocked?: DungeonSkill;
  par: number; // 3성/마스터 기준 최소 타수
  objective: string;
  bossEntity?: {
    line: number;
    col: number;
    text: string;
    shieldType: 'quote' | 'bracket' | 'double';
  };
}

export interface DungeonRecord {
  stageId: number;
  completed: boolean;
  minKeystrokes: number;
  stars: number;
  completedAt: string;
}

export interface DungeonSaveData {
  highestUnlockedStage: number;
  stageRecords: Record<number, DungeonRecord>;
  unlockedSkillIds: string[];
  badges: string[];
}
