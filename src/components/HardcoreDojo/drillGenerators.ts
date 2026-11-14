import {
  RelativeJumpProblem,
  FTSniperProblem,
  WordJumpProblem,
  ProMasterProblem,
  DojoDrillMeta,
  DojoProblem,
} from './HardcoreDojo.types';
import { localized } from '../../i18n';

export const DOJO_DRILL_METAS: Record<string, DojoDrillMeta> = localized({
  'relative-jump': {
    id: 'relative-jump',
    title: '상대 라인 스나이퍼',
    badge: '🎯 Relative Jump',
    description: '상대 라인 번호를 보고 [숫자]jdd 또는 [숫자]kdd로 단번에 목표 줄을 삭제하세요!',
    keyInstructions: '연타 금지! 상대 라인 번호 N을 읽고 [N]jdd 또는 [N]kdd를 사용하세요.',
  },
  'ft-sniper': {
    id: 'ft-sniper',
    title: '인라인 문자 저격',
    badge: '⚡ f/t Sniper',
    description: '긴 코드 라인에서 f{문자}, t{문자}, ;(반복)를 활용하여 목표 문자에 최소 타수로 착지하세요!',
    keyInstructions: 'f/t와 ;를 사용하여 타깃 문자 위치에 착지하세요.',
  },
  'word-jump': {
    id: 'word-jump',
    title: '단어 vs 큰 단어 (w vs W)',
    badge: '🚀 WORD Motion',
    description: '특수문자가 섞인 긴 심볼 덩어리를 작은 단어(w) 대신 대문자 WORD(W)로 단숨에 건너뛰세요!',
    keyInstructions: 'W, E, B를 활용해 기호가 많은 표현식을 최소 타수로 건너뛰세요.',
  },
  'sudden-death': {
    id: 'sudden-death',
    title: '서든데스 10연타 챌린지',
    badge: '⚡ Sudden Death',
    description: '단 1회의 실수도 허용되지 않는 서든데스! 3개 드릴이 교차 출제되며 10연속 노미스로 과녁을 격파하세요.',
    keyInstructions: '노미스 10연타 스피드런! 방향키·연타·실수 즉시 탈락!',
  },
  'pro-master': {
    id: 'pro-master',
    title: '실무 프로 10연타 챌린지',
    badge: '👑 Pro Master',
    description: '텍스트 객체(ci", di(), cit), 단어 대소문자(gU), 인덴트(>>), 라인 합치기(J) 등 실무 핵심 10문제를 최단 키로 격파하세요!',
    keyInstructions: '실무 프로 10연타! 최적의 Vim 텍스트 객체와 연산자로 목표 코드를 완성하세요.',
  },
  'weakness-custom': {
    id: 'weakness-custom',
    title: '약점 집중 맞춤 드릴',
    badge: '🧬 Weakness Fix',
    description: '숙련도 레이더와 안티패턴 감지 통계를 분석해 가장 약한 모션·연산자 10문제를 맞춤 출제합니다.',
    keyInstructions: '나의 약점 집중 교정 코스! 최적의 단축키와 모션으로 10문제를 완주하세요.',
  },
});

export function generateSuddenDeathProblem(combo = 0): DojoProblem {
  const typeIndex = combo % 3;
  if (typeIndex === 0) {
    return generateRelativeJumpProblem();
  } else if (typeIndex === 1) {
    return generateFTSniperProblem();
  } else {
    return generateWordJumpProblem();
  }
}

const CODE_LINES_TEMPLATE = [
  'import { useState, useEffect, useCallback } from "react";',
  'import { fetchUserData, updateProfile } from "./services/api";',
  'interface UserProfileCardProps {',
  '  userId: string;',
  '  initialRole: "admin" | "editor" | "viewer";',
  '  onRoleChange: (newRole: string) => Promise<void>;',
  '}',
  'export function UserProfileCard({ userId }: UserProfileCardProps) {',
  '  const [status, setStatus] = useState<string>("IDLE");',
  '  const [retryCount, setRetryCount] = useState<number>(0);',
  '  useEffect(() => {',
  '    fetchUserData(userId).catch(() => setStatus("ERROR"));',
  '  }, [userId, retryCount]);',
  '  return <div className="user-profile">{userId}:{status}</div>;',
  '}',
];

export function generateRelativeJumpProblem(prevTargetLine?: number): RelativeJumpProblem {
  const lines = [...CODE_LINES_TEMPLATE];
  const total = lines.length;

  // 커서는 위쪽 또는 아래쪽 (줄 2~4 또는 10~12)
  const cursorLine = Math.random() > 0.5 ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 3) + 9;

  // 타깃 줄은 커서 줄에서 최소 3줄 이상 떨어진 곳 선택
  let targetLine = Math.floor(Math.random() * (total - 2)) + 1;
  while (Math.abs(targetLine - cursorLine) < 3 || targetLine === prevTargetLine) {
    targetLine = Math.floor(Math.random() * (total - 2)) + 1;
  }

  const targetText = '  const BUG_TARGET = "🎯 DELETE ME";';
  lines[targetLine] = targetText;

  return {
    type: 'relative-jump',
    lines,
    initialCursor: { line: cursorLine, col: 0 },
    targetLine,
    targetText: '🎯 DELETE ME',
  };
}

const FT_SNIPER_SAMPLES = localized([
  {
    line: 'const connection = "postgres://root:secret_pwd@db.internal.net:5432/app?ssl=true";',
    targets: [
      { char: '@', col: 44, hint: 'f@ 로 단번에 @ 골뱅이로 점프!' },
      { char: '?', col: 69, hint: 'f? 로 쿼리 스트링 시작점으로 점프' },
      { char: '5', col: 59, hint: 'f5 로 포트 번호 5432 저격' },
      { char: ':', col: 25, hint: 'f: 로 프로토콜 콜론 저격' },
    ],
  },
  {
    line: 'function handleRequest(req: HttpRequest, res: HttpResponse): Promise<Result<Data>> {',
    targets: [
      { char: '<', col: 67, hint: 'f< 로 제네릭 Result 시작 위치로 점프' },
      { char: '{', col: 83, hint: 'f{ 로 함수 본문 중괄호로 착지' },
      { char: ',', col: 39, hint: 'f, 로 첫 번째 매개변수 끝 쉼표 저격' },
      { char: ':', col: 26, hint: 'f: 로 타입 콜론 위치로 점프' },
    ],
  },
  {
    line: 'const { userId, userEmail, userRole, permissions } = payload.context.claims;',
    targets: [
      { char: '}', col: 49, hint: 'f} 로 구조 분해 닫는 중괄호로 점프' },
      { char: '.', col: 60, hint: 'f. 후 ; 로 체이닝 점 연속 저격!' },
      { char: ';', col: 75, hint: 'f; 또는 $ 로 줄 끝 세미콜론 착지' },
      { char: '=', col: 51, hint: 'f= 로 할당 연산자로 점프' },
    ],
  },
  {
    line: 'if (status === 200 && response.ok && !response.hasError) {',
    targets: [
      { char: '&', col: 19, hint: 'f& 로 논리 연산자 && 로 점프' },
      { char: '!', col: 37, hint: 'f! 로 부정 연산자 ! 로 점프' },
      { char: '=', col: 11, hint: 'f= 로 일치 연산자 === 로 점프' },
      { char: ')', col: 55, hint: 'f) 또는 t) 로 조건문 닫는 괄호 착지' },
    ],
  },
  {
    line: 'const items = list.map((item) => ({ id: item.id, name: item.name }));',
    targets: [
      { char: '>', col: 31, hint: 'f> 로 화살표 함수 기호로 점프' },
      { char: ':', col: 39, hint: 'f: 후 ; 로 객체 키-값 콜론 연속 저격' },
      { char: ';', col: 69, hint: 'f; 로 줄 끝 세미콜론 착지' },
      { char: '(', col: 23, hint: 'f( 로 map 콜백 괄호로 점프' },
    ],
  },
]);

export function generateFTSniperProblem(prevIndex?: number): FTSniperProblem {
  let sampleIndex = Math.floor(Math.random() * FT_SNIPER_SAMPLES.length);
  if (prevIndex !== undefined && FT_SNIPER_SAMPLES.length > 1) {
    while (sampleIndex === prevIndex) {
      sampleIndex = Math.floor(Math.random() * FT_SNIPER_SAMPLES.length);
    }
  }

  const sample = FT_SNIPER_SAMPLES[sampleIndex];
  const targetObj = sample.targets[Math.floor(Math.random() * sample.targets.length)];

  // 실제 문자열에서 targetObj.col 위치가 맞는지 검증하고 보정
  let actualCol = targetObj.col;
  if (sample.line[actualCol] !== targetObj.char) {
    actualCol = sample.line.indexOf(targetObj.char);
  }

  return {
    type: 'ft-sniper',
    line: sample.line,
    initialCursor: { line: 0, col: 0 },
    targetCol: actualCol,
    targetChar: targetObj.char,
    hint: targetObj.hint,
  };
}

const WORD_JUMP_SAMPLES = [
  {
    line: 'const res = api.v1.auth.tokens[user_id].refresh() || execute(callback);',
    // Words: [0: const], [6: res], [10: =], [12: api.v1.auth.tokens[user_id].refresh()], [51: ||], [54: execute(callback);]
    targetStartCol: 51,
    targetEndCol: 52,
    targetToken: '||',
    optimalKeyCount: 4, // 4W from col 0
  },
  {
    line: 'return sanitize_input(req.headers["x-auth-token"]) ?? default_user_profile;',
    // Words: [0: return], [7: sanitize_input(req.headers["x-auth-token"])], [51: ??], [54: default_user_profile;]
    targetStartCol: 51,
    targetEndCol: 52,
    targetToken: '??',
    optimalKeyCount: 2, // 2W
  },
  {
    line: 'export const client = new Database.Cluster.Manager(config.primary_node.url);',
    // Words: [0: export], [7: const], [13: client], [20: =], [22: new], [26: Database.Cluster.Manager(config.primary_node.url);]
    targetStartCol: 26,
    targetEndCol: 34,
    targetToken: 'Database',
    optimalKeyCount: 5, // 5W
  },
  {
    line: 'result = compute.matrix.multiply(tensor_a,tensor_b).normalize() + offset_val;',
    // Words: [0: result], [7: =], [9: compute.matrix.multiply(tensor_a,tensor_b).normalize()], [64: +], [66: offset_val;]
    targetStartCol: 64,
    targetEndCol: 64,
    targetToken: '+',
    optimalKeyCount: 3, // 3W
  },
  {
    line: 'const url = "https://internal.service.corp.net:8443/v2/metrics" || fallback_endpoint;',
    // Words: [0: const], [6: url], [10: =], [12: "https://..."], [64: ||], [67: fallback_endpoint;]
    targetStartCol: 64,
    targetEndCol: 65,
    targetToken: '||',
    optimalKeyCount: 4, // 4W
  },
];

export function generateWordJumpProblem(prevIndex?: number): WordJumpProblem {
  let sampleIndex = Math.floor(Math.random() * WORD_JUMP_SAMPLES.length);
  if (prevIndex !== undefined && WORD_JUMP_SAMPLES.length > 1) {
    while (sampleIndex === prevIndex) {
      sampleIndex = Math.floor(Math.random() * WORD_JUMP_SAMPLES.length);
    }
  }

  const sample = WORD_JUMP_SAMPLES[sampleIndex];

  return {
    type: 'word-jump',
    line: sample.line,
    initialCursor: { line: 0, col: 0 },
    targetStartCol: sample.targetStartCol,
    targetEndCol: sample.targetEndCol,
    targetToken: sample.targetToken,
    optimalKeyCount: sample.optimalKeyCount,
  };
}

export const PRO_MASTER_PROBLEMS: Array<Omit<ProMasterProblem, 'type' | 'index'>> = [
  {
    prompt: '문자열 따옴표 내부를 비우세요!',
    lines: ['const token = "EXPIRED_SECRET_KEY";'],
    initialCursor: { line: 0, col: 18 },
    targetLines: ['const token = "";'],
    hint: 'ci" 후 Esc',
    optimalKeys: 'ci"<Esc>',
  },
  {
    prompt: '함수 인자 전체를 한 번에 삭제하세요!',
    lines: ['const result = calculate(arg1, arg2, arg3);'],
    initialCursor: { line: 0, col: 26 },
    targetLines: ['const result = calculate();'],
    hint: 'di(',
    optimalKeys: 'di(',
  },
  {
    prompt: '태그 내부의 텍스트를 비우세요!',
    lines: ['<h1 className="title">Old Title</h1>'],
    initialCursor: { line: 0, col: 25 },
    targetLines: ['<h1 className="title"></h1>'],
    hint: 'cit 후 Esc',
    optimalKeys: 'cit<Esc>',
  },
  {
    prompt: '변수명을 대문자로 변환하세요!',
    lines: ['const api_endpoint = "/v1/users";'],
    initialCursor: { line: 0, col: 6 },
    targetLines: ['const API_ENDPOINT = "/v1/users";'],
    hint: 'gUiw',
    optimalKeys: 'gUiw',
  },
  {
    prompt: '버전 번호 9를 10으로 올리세요!',
    lines: ['export const API_VERSION = 9;'],
    initialCursor: { line: 0, col: 27 },
    targetLines: ['export const API_VERSION = 10;'],
    hint: 'Ctrl-a (<C-a>)',
    optimalKeys: '<C-a>',
  },
  {
    prompt: '라인을 들여쓰기하세요!',
    lines: ['return isValid ? data : null;'],
    initialCursor: { line: 0, col: 0 },
    targetLines: ['  return isValid ? data : null;'],
    hint: '>>',
    optimalKeys: '>>',
  },
  {
    prompt: '두 줄을 한 줄로 합치세요!',
    lines: ['const message =', '  "Hello World!";'],
    initialCursor: { line: 0, col: 0 },
    targetLines: ['const message = "Hello World!";'],
    hint: 'J',
    optimalKeys: 'J',
  },
  {
    prompt: '주석 시작점부터 줄 끝까지 삭제하세요!',
    lines: ['const debugLog = true; // REMOVE DEBUG COMMENT'],
    initialCursor: { line: 0, col: 23 },
    targetLines: ['const debugLog = true; '],
    hint: 'D',
    optimalKeys: 'D',
  },
  {
    prompt: '함수 본문(중괄호 안)을 비우세요!',
    lines: ['function process() {', '  cleanData();', '  return true;', '}'],
    initialCursor: { line: 1, col: 4 },
    targetLines: ['function process() {', '}'],
    hint: 'di{',
    optimalKeys: 'di{',
  },
  {
    prompt: '첫 번째 bad 변수를 good으로 바꾸세요!',
    lines: ['const bad = 1;', 'const bad = 2;'],
    initialCursor: { line: 0, col: 6 },
    targetLines: ['const good = 1;', 'const bad = 2;'],
    hint: 'cwgood 후 Esc',
    optimalKeys: 'cwgood<Esc>',
  },
];

export function generateProMasterProblem(combo = 0): ProMasterProblem {
  const index = Math.max(0, Math.min(PRO_MASTER_PROBLEMS.length - 1, combo % PRO_MASTER_PROBLEMS.length));
  const sample = PRO_MASTER_PROBLEMS[index];
  return {
    type: 'pro-master',
    index,
    prompt: sample.prompt,
    lines: [...sample.lines],
    initialCursor: { ...sample.initialCursor },
    targetLines: [...sample.targetLines],
    hint: sample.hint,
    optimalKeys: sample.optimalKeys,
  };
}
