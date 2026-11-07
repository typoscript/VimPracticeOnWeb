# CLAUDE.md - VimPracticeOnWeb 개발 가이드 & 프로젝트 규약

## 1. 프로젝트 개요 & 아키텍처 원칙
- **프로젝트 명칭**: VimPracticeOnWeb
- **목적**: 브라우저에서 실제 터미널 Neovim/Vim과 100% 동일한 키바인딩과 감각을 연습할 수 있는 고정밀 인터랙티브 웹 애플리케이션
- **핵심 아키텍처**:
  - UI 렌더링은 React + Vite 기반이며, Vim 에디터 동작은 **`src/engine/`에 위치한 순수 함수형 불변 상태 머신(Pure Functional State Machine)**으로 구동됩니다.
  - 외부 라이브러리 플러그인에 의존하지 않고, 모든 Vim 모션·연산자·레지스터·매크로·정규식 치환·버퍼·윈도우 분할·탭·퀵픽스·로케이션 리스트·마크·키매핑·서라운드 엔진이 TypeScript 순수 로직으로 구현되어 있습니다.
  - 상태 변이는 항상 `handleKey(state, key) => newState`를 통해 불변 객체 복제 방식으로 처리됩니다.

---

## 2. 빌드 및 테스트 명령어
- **단위 테스트 실행 (단일 파일)**:
  `npm test -- src/engine/vimEngine.test.ts --run`
- **전체 테스트 스위트 실행**:
  `npm test -- --run`
  *(현재 90개 테스트 파일, 1,150개 테스트 100% 통과 필수)*
- **TypeScript 타입 체크 및 Vite 프로덕션 빌드**:
  `npm run build`
  *(strictNullChecks 및 noUnusedLocals 활성화 상태로 TS6133 등 미사용 변수 에러 발생 주의)*
- **로컬 개발 서버 실행**:
  `npm run dev`

---

## 3. 핵심 개발 및 불변성(Invariants) 규약
1. **불변 상태 관리 (State Immutability)**:
   - `state`의 lines, cursor, marks, registers 등은 절대로 직접 변경(mutate)하지 않고 항상 스프레드 연산자나 새 배열/객체 복사로 반환합니다.
   - 개발 환경에서 `deepFreeze(state)`가 적용되며, `assertValidVimState` 불변성 검사를 통과해야 합니다.
2. **커서 경계 제약 (`clampCursor`)**:
   - 모드(`NORMAL`, `INSERT`, `VISUAL` 등)에 따라 커서 col/line 범위가 엄격히 제한됩니다. 라인 수정 후 반드시 `clampCursor`를 적용하세요.
3. **오퍼레이터 & 도트 반복(`.`) 일관성**:
   - 텍스트 변경을 유발하는 모든 연산자는 이전 상태를 `pushUndoSnapshot(state)`으로 스택에 기록하고, `lastChangeKeys`에 실행 키스트로크를 저장하여 `.` 반복이 동작하도록 해야 합니다.
4. **미션(레슨) 추가 시 4대 동기화 필수 규칙**:
   신규 레슨 $N$을 추가할 때 반드시 아래 4개 파일을 동시에 동기화해야 테스트가 깨지지 않습니다:
   - `src/data/missions.ts`: 신규 레슨 정의, 3성 기준 `par`, 최적 키 시퀀스 `optimalKeys`, `checkComplete` 작성.
   - `src/data/missions.test.ts`: 개별 레슨 테스트 추가 및 하단 `expect(MISSIONS.length).toBe(N)` 총 개수 갱신. (모든 레슨의 `optimalKeys`가 par 이하이며 실행 시 완료되는지 자동 검증됨)
   - `src/App.tsx`: `SPEEDRUN_CANDIDATE_IDS` 배열에 신규 레슨 ID 추가.
   - `README.md`: `## 🎯 튜토리얼 커리큘럼 (Lessons 1 ~ N)` 헤더 및 본문 목록 갱신.

---

## 4. 현재 구현 완료 현황 (레슨 1 ~ 52)
- **기초 이동 & 편집 (레슨 1 ~ 10)**: `h, j, k, l`, `w, b, e`, `$`, `x`, `i/Esc`, `dd`, `dw`, `u`, `v`, 숫자 카운트
- **효율적 가속 (레슨 11 ~ 19)**: `o, A, I`, `cw, r`, `f, t, df`, `ciw, di"`, `.`, `/ n N *`, `:%s/old/new/g`, 매크로 `qa @a %`, `Ctrl+v` 비주얼 블록
- **실무 프로 생산성 (레슨 20 ~ 32)**: `m, ', Ctrl-o`, `J, ~, >>, <<, Ctrl-a/x`, `:g/pat/d, :norm`, `"_ "a`, `:vsp Ctrl-w`, `cit, gg=G`, `Ctrl+w, Ctrl+n`, `{} gi gv g;`, `\1 \2 \u`, `Ctrl+r 0, Ctrl+r =`, `cgn .`, `"A qA`, `g Ctrl+a, :sort u`
- **버퍼·윈도우·탐색·고급 순정 기능 (레슨 33 ~ 52)**:
  - `:bnext, :bprev, Ctrl-^` (버퍼)
  - `:tabnew, gt, gT, :tabclose` (탭페이지)
  - `q:, q/, q?` (커맨드라인 윈도우)
  - `:cc, :cn, :cp, :copen, :vimgrep, :cfile` (퀵픽스 리스트)
  - `g;, g,, :changes` (체인지 리스트)
  - `:args, :argdo, :n` (아규먼트 리스트)
  - `:Explore, :E` (순정 Netrw 파일 탐색기)
  - `:e ~/.vimrc, :source %` (.vimrc 소싱)
  - `Ctrl+], Ctrl+t` (순정 ctags 심볼 점프)
  - `:diffsplit, ]c, [c, do, dp` (순정 diff 비교/병합)
  - `Ctrl+x Ctrl+f, Ctrl+x Ctrl+l` (경로/라인 완성)
  - `g-, g+, :undolist, :earlier, :later` (순정 Undo Tree 시간 여행)
  - `gU, gu, g~` (대소문자 오퍼레이터/모션)
  - `za, zo, zM, zR` (순정 코드 폴딩)
  - `:%s/old/new/gc` (대화형 선별 치환 y/n/a/q)
  - `:lvimgrep, :lopen, :lne, :lp, :lfile` (윈도우 로컬 로케이션 리스트)
  - `mA~mZ, 'A~'Z, :marks` (대문자 전역 마크 및 버퍼 자동 전환)
  - `:nmap, :nnoremap, :imap, :vmap, :unmap` (키매핑 인터프리터)
  - `cs, ds, ysiw, yss, S` (순정 vim-surround 괄호/따옴표 감싸기 엔진)

---

## 5. 다음 개발 로드맵 추천 후보
클로드에게 다음 작업을 지시할 때 아래 항목 중에서 지정하시면 됩니다:
1. **매크로 슬로우모션 뷰어 & 비주얼 디버거 (`MacroDebugger`)**:
   - `@a` 매크로 실행 시 0.1~0.3초 딜레이를 주어 글자가 지워지고 커서가 이동하는 과정을 한 프레임씩 보여주는 재생 속도 조절(1x, 0.5x, 0.2x) 및 단계별 스텝 실행 UI.
2. **사용자 정의 Ex 커맨드 및 Vim 함수 엔진 (`:command!`, `:function`)**:
   - 사용자가 커맨드라인 또는 `.vimrc`에서 커스텀 Ex 명령어(`:command! W w`, `:command! Q q`)를 선언하고 호출할 수 있는 인터프리터.
3. **순정 Vim 맞춤법 검사기 (`:set spell`, `]s`, `[s`, `z=`, `zg`)**:
   - 코드 주석이나 문자열에서 오탈자를 탐색하고 `z=`로 교체 추천 목록을 띄우는 기능.
4. **인덴트 텍스트 객체 확장 (`ii`, `ai`)**:
   - Python이나 들여쓰기 기반 블록을 한 번에 다루는 `vii`, `dii`, `cai` 등의 실무 텍스트 객체 확장.
