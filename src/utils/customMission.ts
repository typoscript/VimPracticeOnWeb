import { Mission } from '../types/mission';
import { localized, t } from '../i18n';
import { STORAGE_KEYS, readStorageJson, writeStorageJson } from './localStorageClient';

export const CUSTOM_MISSIONS_STORAGE_KEY = STORAGE_KEYS.CUSTOM_MISSIONS;

export interface CustomMissionData {
  title: string;
  description: string;
  initialText: string;
  targetText: string;
  par: number;
}

export interface SavedCustomMission {
  id: string;
  savedAt: string;
  data: CustomMissionData;
}

export interface CustomMissionPreset {
  id: string;
  badge: string;
  data: CustomMissionData;
}

export const CUSTOM_MISSION_PRESETS: readonly CustomMissionPreset[] = localized([
  {
    id: 'arrow-refactor',
    badge: 'JS/TS',
    data: {
      title: '함수 화살표 문법 리팩토링',
      description: '일반 함수를 화살표 함수 및 템플릿 리터럴로 변환하세요.',
      initialText: 'function greet(name) {\n  return "Hello, " + name + "!";\n}',
      targetText: 'const greet = (name) => `Hello, ${name}!`;',
      par: 45,
    },
  },
  {
    id: 'regex-log-cleanup',
    badge: 'Regex',
    data: {
      title: '로그 태그 일괄 정규화',
      description: '정규식 치환(:%s)이나 매크로로 각 줄 앞의 [DEBUG] 태그를 INFO: 형식으로 바꾸세요.',
      initialText: '[DEBUG] server started\n[DEBUG] db connected\n[DEBUG] cache warmed',
      targetText: 'INFO: server started\nINFO: db connected\nINFO: cache warmed',
      par: 18,
    },
  },
  {
    id: 'json-macro-wrap',
    badge: 'Macro',
    data: {
      title: '목록을 JSON 객체 배열로 변환',
      description: '매크로(qa/@a) 또는 Visual Block으로 각 단어를 {"name": "..."}, 형태로 감싸세요.',
      initialText: 'alpha\nbeta\ngamma',
      targetText: '{"name": "alpha"},\n{"name": "beta"},\n{"name": "gamma"},',
      par: 26,
    },
  },
  {
    id: 'surround-cleanup',
    badge: 'Surround',
    data: {
      title: '괄호와 따옴표 서라운드 변환',
      description: 'vim-surround(cs/ys)나 텍스트 객체로 작은따옴표와 대괄호를 큰따옴표와 소괄호로 바꾸세요.',
      initialText: "const items = ['vim', 'nvim'];\nlog(['ready']);",
      targetText: 'const items = ("vim", "nvim");\nlog(("ready"));',
      par: 20,
    },
  },
]);

export function normalizeCustomMissionData(raw: unknown): CustomMissionData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const parsed = raw as Record<string, unknown>;
  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.initialText !== 'string' ||
    typeof parsed.targetText !== 'string'
  ) {
    return null;
  }
  const parVal = typeof parsed.par === 'number' && Number.isFinite(parsed.par) && parsed.par > 0
    ? Math.floor(parsed.par)
    : 10;
  return {
    title: parsed.title,
    description: typeof parsed.description === 'string' ? parsed.description : '',
    initialText: parsed.initialText,
    targetText: parsed.targetText,
    par: parVal,
  };
}

/**
 * CustomMissionData를 URL-safe Base64 문자열로 인코딩합니다.
 * UTF-8 한글 및 특수 기호를 손실 없이 처리합니다.
 */
export function encodeCustomMission(data: CustomMissionData): string {
  try {
    const jsonStr = JSON.stringify({
      title: data.title,
      description: data.description,
      initialText: data.initialText,
      targetText: data.targetText,
      par: data.par,
    });

    const utf8Bytes = new TextEncoder().encode(jsonStr);
    let binStr = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binStr += String.fromCharCode(utf8Bytes[i]);
    }
    const base64 = btoa(binStr);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (err) {
    console.error('Failed to encode custom mission:', err);
    return '';
  }
}

/**
 * URL-safe Base64 문자열을 CustomMissionData 객체로 복원합니다.
 */
export function decodeCustomMission(encoded: string): CustomMissionData | null {
  if (!encoded || typeof encoded !== 'string') return null;

  try {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    const jsonStr = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(jsonStr);
    return normalizeCustomMissionData(parsed);
  } catch {
    return null;
  }
}

/**
 * URL(?challenge=...), Base64 토큰, 또는 JSON 문자열에서 커스텀 미션을 파싱합니다.
 */
export function parseCustomMissionInput(raw: string): CustomMissionData | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      return normalizeCustomMissionData(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  if (trimmed.includes('challenge=')) {
    try {
      if (/^https?:\/\//i.test(trimmed)) {
        const parsedUrl = new URL(trimmed);
        const token = parsedUrl.searchParams.get('challenge');
        if (token) return decodeCustomMission(token);
      }
    } catch {
      // Fall back to query regex extraction below
    }
    const match = trimmed.match(/(?:^|[?&])challenge=([^&#\s]+)/);
    if (match?.[1]) {
      try {
        return decodeCustomMission(decodeURIComponent(match[1]));
      } catch {
        return decodeCustomMission(match[1]);
      }
    }
    return null;
  }

  return decodeCustomMission(trimmed);
}

/**
 * 커스텀 미션 데이터를 보기 좋은 JSON 문자열로 내보냅니다.
 */
export function exportCustomMissionJson(data: CustomMissionData): string {
  return JSON.stringify(
    {
      title: data.title,
      description: data.description,
      initialText: data.initialText,
      targetText: data.targetText,
      par: data.par,
    },
    null,
    2
  );
}

function normalizeSavedMissionItem(raw: unknown): SavedCustomMission | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id.trim()) return null;
  const data = normalizeCustomMissionData(item.data);
  if (!data) return null;
  return {
    id: item.id,
    savedAt: typeof item.savedAt === 'string' ? item.savedAt : new Date(0).toISOString(),
    data,
  };
}

export function loadSavedCustomMissions(): SavedCustomMission[] {
  const parsed = readStorageJson<unknown>(CUSTOM_MISSIONS_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalizeSavedMissionItem)
    .filter((item): item is SavedCustomMission => item !== null);
}

function persistSavedCustomMissions(list: SavedCustomMission[]): void {
  writeStorageJson(CUSTOM_MISSIONS_STORAGE_KEY, list);
}

export function saveCustomMission(
  data: CustomMissionData,
  existingId?: string
): SavedCustomMission[] {
  const normalized = normalizeCustomMissionData(data);
  if (!normalized) return loadSavedCustomMissions();

  const current = loadSavedCustomMissions();
  const now = new Date().toISOString();

  if (existingId) {
    const idx = current.findIndex((item) => item.id === existingId);
    if (idx >= 0) {
      const updated: SavedCustomMission = { id: existingId, savedAt: now, data: normalized };
      const next = [updated, ...current.filter((item) => item.id !== existingId)];
      persistSavedCustomMissions(next);
      return next;
    }
  }

  const entry: SavedCustomMission = {
    id: existingId || `cm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    savedAt: now,
    data: normalized,
  };
  const next = [entry, ...current];
  persistSavedCustomMissions(next);
  return next;
}

export function deleteSavedCustomMission(id: string): SavedCustomMission[] {
  const current = loadSavedCustomMissions();
  const next = current.filter((item) => item.id !== id);
  persistSavedCustomMissions(next);
  return next;
}

function missionFingerprint(data: CustomMissionData): string {
  return `${data.title}\0${data.initialText}\0${data.targetText}`;
}

export function mergeSavedCustomMissions(
  existingRaw: unknown,
  incomingRaw: unknown
): SavedCustomMission[] {
  const existing = Array.isArray(existingRaw)
    ? existingRaw.map(normalizeSavedMissionItem).filter((x): x is SavedCustomMission => x !== null)
    : [];
  const incoming = Array.isArray(incomingRaw)
    ? incomingRaw.map(normalizeSavedMissionItem).filter((x): x is SavedCustomMission => x !== null)
    : [];

  const seenIds = new Set(existing.map((m) => m.id));
  const seenFingerprints = new Set(existing.map((m) => missionFingerprint(m.data)));
  const merged = [...existing];

  for (const item of incoming) {
    const fp = missionFingerprint(item.data);
    if (seenIds.has(item.id) || seenFingerprints.has(fp)) continue;
    seenIds.add(item.id);
    seenFingerprints.add(fp);
    merged.push(item);
  }
  return merged;
}

/**
 * CustomMissionData를 애플리케이션의 Mission 객체로 변환합니다.
 */
export function createCustomMissionObject(data: CustomMissionData): Mission {
  const initialLines = data.initialText.split('\n');
  const targetLines = data.targetText.split('\n');

  return {
    id: 999999,
    title: data.title.trim() || t('🏌️ 커스텀 Vim Golf 미션'),
    description: data.description.trim() || t('목표 코드와 완벽히 일치하도록 텍스트를 편집하세요.'),
    hint: t('목표 타수(Par) 이내로 최소 키 입력을 달성하여 최고 등급(3성)에 도전하세요!'),
    par: data.par > 0 ? data.par : 10,
    initialLines: initialLines.length > 0 ? initialLines : [''],
    targetLines: targetLines,
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.lines.length !== targetLines.length) return false;
      return state.lines.every((line, idx) => line === targetLines[idx]);
    },
  };
}

/**
 * 브라우저 URL의 쿼리 스트링(`?challenge=...`)에서 커스텀 미션 데이터를 추출합니다.
 */
export function getChallengeFromUrl(): CustomMissionData | null {
  if (typeof window === 'undefined') return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const challenge = params.get('challenge');
    if (!challenge) return null;
    return decodeCustomMission(challenge);
  } catch {
    return null;
  }
}

/**
 * 주어진 CustomMissionData에 대한 공유 가능한 전체 URL을 생성합니다.
 */
export function buildChallengeUrl(data: CustomMissionData): string {
  const encoded = encodeCustomMission(data);
  if (typeof window === 'undefined') {
    return `?challenge=${encoded}`;
  }
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return `${baseUrl}?challenge=${encoded}`;
}
