import { Mission } from '../types/mission';

export interface CustomMissionData {
  title: string;
  description: string;
  initialText: string;
  targetText: string;
  par: number;
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

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.title === 'string' &&
      typeof parsed.initialText === 'string' &&
      typeof parsed.targetText === 'string'
    ) {
      return {
        title: parsed.title,
        description: typeof parsed.description === 'string' ? parsed.description : '',
        initialText: parsed.initialText,
        targetText: parsed.targetText,
        par: typeof parsed.par === 'number' && parsed.par > 0 ? parsed.par : 10,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * CustomMissionData를 애플리케이션의 Mission 객체로 변환합니다.
 */
export function createCustomMissionObject(data: CustomMissionData): Mission {
  const initialLines = data.initialText.split('\n');
  const targetLines = data.targetText.split('\n');

  return {
    id: 999999,
    title: data.title.trim() || '🏌️ 커스텀 Vim Golf 미션',
    description: data.description.trim() || '목표 코드와 완벽히 일치하도록 텍스트를 편집하세요.',
    hint: '목표 타수(Par) 이내로 최소 키 입력을 달성하여 최고 등급(3성)에 도전하세요!',
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
