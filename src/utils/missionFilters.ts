import { Mission } from '../types/mission';
import { i18nKey } from '../i18n';

export type MissionCategoryTag =
  | 'all'
  | 'basic'
  | 'motion'
  | 'textobject'
  | 'ex'
  | 'vimscript'
  | 'netrw';

export interface CategoryTagInfo {
  id: MissionCategoryTag;
  label: string;
}

export const MISSION_CATEGORY_TAGS: CategoryTagInfo[] = [
  { id: 'all', label: i18nKey('전체') },
  { id: 'basic', label: i18nKey('기초') },
  { id: 'motion', label: i18nKey('모션') },
  { id: 'textobject', label: i18nKey('텍스트객체') },
  { id: 'ex', label: i18nKey('Ex 커맨드') },
  { id: 'vimscript', label: i18nKey('Vimscript') },
  { id: 'netrw', label: i18nKey('Netrw') },
];

export function getTagLabel(tagId: MissionCategoryTag): string {
  const found = MISSION_CATEGORY_TAGS.find((t) => t.id === tagId);
  return found ? found.label : tagId;
}

const MOTION_IDS = [1, 2, 3, 7, 8, 10, 13, 16, 18, 20, 27, 41, 47, 60];
const TEXTOBJECT_IDS = [14, 25, 52, 54, 58];
const EX_IDS = [17, 22, 24, 32, 35, 36, 37, 38, 46, 48, 49, 55, 59, 63, 65];
const VIMSCRIPT_IDS = [40, 51, 55, 56, 57, 61, 62, 63];
const NETRW_IDS = [24, 33, 34, 38, 39, 42, 64];

export function getMissionTags(mission: Mission): MissionCategoryTag[] {
  const tags: MissionCategoryTag[] = [];
  const id = mission.id;

  if (id >= 1 && id <= 13) {
    tags.push('basic');
  }
  if (MOTION_IDS.includes(id)) {
    tags.push('motion');
  }
  if (TEXTOBJECT_IDS.includes(id)) {
    tags.push('textobject');
  }
  if (EX_IDS.includes(id)) {
    tags.push('ex');
  }
  if (VIMSCRIPT_IDS.includes(id)) {
    tags.push('vimscript');
  }
  if (NETRW_IDS.includes(id)) {
    tags.push('netrw');
  }

  // Fallback if no category matched
  if (tags.length === 0) {
    if (id <= 20) tags.push('basic');
    else if (id <= 52) tags.push('ex');
    else tags.push('vimscript');
  }

  return tags;
}

export interface MissionFilterOptions {
  searchQuery: string;
  category: MissionCategoryTag;
  statusFilter?: 'all' | 'completed' | 'uncompleted';
}

export function filterMissions(
  missions: Mission[],
  options: MissionFilterOptions,
  progress: Record<number, { completed?: boolean }> = {}
): Mission[] {
  const { searchQuery, category, statusFilter = 'all' } = options;
  const query = searchQuery.trim().toLowerCase();

  return missions.filter((m) => {
    // 1. Category filter
    if (category !== 'all') {
      const tags = getMissionTags(m);
      if (!tags.includes(category)) {
        return false;
      }
    }

    // 2. Status filter
    if (statusFilter === 'completed') {
      if (!progress[m.id]?.completed) return false;
    } else if (statusFilter === 'uncompleted') {
      if (progress[m.id]?.completed) return false;
    }

    // 3. Search query filter
    if (query) {
      const idMatch = `#${m.id}`.includes(query) || `${m.id}` === query;
      const titleMatch = m.title.toLowerCase().includes(query);
      const descMatch = m.description.toLowerCase().includes(query);
      const hintMatch = m.hint.toLowerCase().includes(query);
      const keyMatch = m.optimalKeys?.some((k) => k.toLowerCase().includes(query));

      if (!idMatch && !titleMatch && !descMatch && !hintMatch && !keyMatch) {
        return false;
      }
    }

    return true;
  });
}
