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
  *(현재 105개 테스트 파일, 1,364개 테스트 100% 통과 필수)*
- **TypeScript 타입 체크 및 Vite 프로덕션 빌드**:
  `npm run build`
  *(strictNullChecks 및 noUnusedLocals 활성화 상태로 TS6133 등 미사용 변수 에러 발생 주의)*
- **로컬 개발 서버 실행**:
  `npm run dev`
- **번들 분할**: 아케이드·던전·도장 탭과 커스텀 미션·분석·데일리·설정 내보내기·BYOC 모달은 `App.tsx`에서 `React.lazy`로 지연 로딩되고, React는 `react-vendor` 청크로 분리됩니다(`vite.config.ts`). 모달은 `useOpenedOnce`로 처음 열 때 불러온 뒤 마운트를 유지합니다. 이 화면들을 테스트할 때는 처음 나타나는 요소를 `await screen.findBy...`로 기다리세요.

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

## 4. 현재 구현 완료 현황 (레슨 1 ~ 60)
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
- **매크로 심화 & 디버깅 (레슨 53)**: `@a, @@, [count]@@` + 매크로 슬로우모션 디버거 (`src/engine/macroDebugger.ts`, `src/components/MacroDebugger/`: 1x/0.5x/0.2x 재생, 키 단위 스텝, 프레임 미리보기).
- **실패 신호(bell) & 연산자+모션**: 실패한 키는 상태에 일시적 `bell: true`를 남기며(매 키 입력 시작 시 제거), `@` 매크로·`.` 반복·`:normal`·키매핑 재생은 bell에서 중단됩니다. `src/engine/operatorMotion.ts`가 `d/c/y` + `j k G gg`(줄 단위), `h l b B ^`(배타적 문자 단위)를 처리하며 실패 시 bell을 울립니다. UI는 bell마다 에디터 테두리를 깜빡입니다(visualbell, `Editor`의 `bellSignal`). VISUAL 모드 모션, `%`, `*`/`#`(E348), 미설정 마크(E20), 빈 레지스터 `p`(E353), 마지막 줄 `J`, 숫자 없는 `Ctrl-a`, 줄보다 긴 `[count]r`, 알 수 없는 Ex 명령(E492)도 bell을 울립니다. ⚠ Vim `nv_wordcmd`처럼 연산자와 함께 쓴 `e`는 버퍼 끝에서도 실패하지 않습니다(`de`는 마지막 문자 삭제) — 판정 기준은 Vim 소스와 `test/vimDifferential.fuzz.test.ts`.
- **순정 Vim 정규식 (`src/engine/vimRegex.ts`의 `compileVimRegex`)**: `/` `?` `n` `N` `*` `#` `gn` 하이라이트, `:s`, `:g`, `:/pat/` 범위, `:vimgrep`, `:lvimgrep`, `=~`, `substitute()`/`split()`/`match()` 가 모두 같은 변환기를 씁니다. magic 기본 모드에서 `+ ? = | ( ) { } < >`는 리터럴이며 `\` 를 붙여야 특수 문자입니다(`\+`, `\(…\)`). `\v`/`\m`/`\M`/`\V`, `\zs`/`\ze`, `\{-}`, `\%(`, `\@=` 류, `\a \l \u \x \h \k`, `[[:alpha:]]`, `\c`/`\C`, smartcase(`\` 뒤 대문자 제외)를 지원합니다. `*`/`#`은 `\<word\>` 로 단어 전체를 찾습니다. ⚠ 새 코드에서 Vim 패턴을 다룰 때 `new RegExp(pattern)` 을 직접 쓰지 말고 반드시 `compileVimRegex` 를 사용하세요.
- **`:s` 고급 기능 (레슨 59)**: `\=expr` 계산식 치환(`submatch(n)`, 치환 중인 줄이 `line('.')`, 리스트 결과는 여러 줄), `\r` 줄 나누기, 치환 문자열·패턴의 `~`(직전 치환 문자열), 빈 패턴 `:s//new/`, `:&` / `:&&` / 인자 없는 `:s`, 노멀 `&` / `g&`. 대소문자는 `I`(구분) > `i`(무시) > `ignorecase`+`smartcase` 순이며 `gc` 확인 모드도 같은 값을 씁니다. 직전 치환은 `state.lastSubstitute`, 성공한 `:s` 패턴은 `lastSearchQuery` 가 됩니다.
- **자주 쓰는 명령 정리**: `>`/`<` + 모든 모션·텍스트 객체(`>ip`, `>}`, `>i{`; 임시 상태에서 모션/`v`+객체를 실행해 줄 범위 계산, exclusive 모션이 아래 줄 첫 칸에서 끝나면 그 줄 제외, 빈 줄은 들여쓰지 않음), `[count]p/P`(내용을 반복해 한 번에), `ga`, `:noh`(`hlsearchSuppressed`, 다음 검색·`n`에서 해제), `:t0`/`:m0`, `i<`/`a<`, `g?`(ROT13, `g??`·`g?g?`), `gUgU`, VISUAL `[(` 류. 여러 줄 `i{`/`i(`는 Vim `current_block` 규칙대로 `{` 줄과 `}` 줄을 남기는 줄 단위 객체입니다.
- **실제 Neovim 으로 동작 확인**: 이 컴퓨터에는 `nvim` 이 있습니다. `nvim --headless -u NONE -i NONE` 으로 키 시퀀스를 실행해 결과를 확인하세요. CodeMirror 오라클(`test/oracle`)이 실제 Vim 과 다른 경우에는 `test/vimDifferential*.test.ts` 에서 Neovim 으로 확인한 결과와 비교합니다(`NEOVIM_VERIFIED_CASES`, `runAgainstNeovim`).
- **보조 모션 (레슨 60, `src/engine/extraMotions.ts`)**: `(` `)` 문장(exclusive), `ge` `gE` 이전 단어 끝(inclusive, 뒤로), `g_`(inclusive), `+` `-` `Enter`(줄 단위), `[count]|`(exclusive), `[(` `[{` `])` `]}` 짝 없는 괄호(exclusive, 여러 줄). 노멀·VISUAL·`d/c/y`·`.` 반복·bell 지원. 연산자 처리는 `operatorMotion.ts`가 모션 종류(inclusive/exclusive/linewise)로 분기합니다.
- **문단·문장 텍스트 객체 (레슨 58)**: `ip`/`ap`(Vim `current_par()` 규칙, 공백만 있는 줄도 빈 줄, 줄 단위), `is`/`as`(문자 단위, 여러 줄 문장, 앞뒤 공백은 같은 줄까지). 카운트는 `2dap`·`d2ap` 모두 지원 (`textObjects.ts`의 `getParagraphObjectRange`, `getSentenceObjectRange`, `executeLinewiseObjectOperator`).
- **인덴트 텍스트 객체 (레슨 54)**: `ii, ai, iI, aI, [count]ii` + `d/c/y/v/=/gu/gU/g~` (`textObjects.ts`의 `getIndentObjectRange`, `executeIndentObjectOperator`, 항상 줄 단위)
- **사용자 정의 Ex 명령 (레슨 55)**: `:command[!] [-nargs] [-range[=%]] [-bang] Name ...`, `:delcommand`, `:comclear`, `:command` 목록, `<args> <q-args> <line1> <line2> <bang> <lt>` 치환, 접두어 호출, `.vimrc` 소싱 (`src/engine/userCommandEngine.ts`). 내장 명령이 먼저 평가되어 사용자 명령에 가려지지 않습니다. `<f-args>`로 함수에 인자를 나눠 전달합니다.
- **Vim script 함수 (레슨 56)**: `:function[!] Name(a, ...) [range] [abort]` → 커맨드라인 본문 입력(`functionDraft`) → `:endfunction`, `:delfunction`, `:[range]call`(range 속성 없으면 줄마다 호출), `:let`/`:unlet`/`:echo`/`:execute`, 본문의 `return`·`if/elseif/else/endif`·`while/break/continue`. 표현식은 `src/engine/vimscriptEval.ts`(숫자·문자열, g:/l:/a:/@r, 내장 함수), 실행은 `src/engine/vimscriptEngine.ts`. `:call` 하나는 한 번의 실행 취소 단위입니다.
- **Vim script 리스트·딕셔너리 (레슨 57)**: `[1, 'a']`, `{'k': v}`, `#{k: v}`, 인덱스·슬라이스(`l[1:]`, `s[-3:]`), `d.key`, `=~`/`!~`, `is`, `:for x in list` / `:for [k, v] in items(d)`, `:let l[0] = x` / `:let [a, b; rest] = list`, `:unlet d.k`, `a:000`, 내장 함수(`substitute`, `printf`, `map`, `filter`, `sort`, `split`, `join`, `range`, `keys`, `items` 등). Vim 정규식 변환은 `src/engine/vimRegex.ts`(아래 '순정 Vim 정규식' 참고). ⚠ 불변 상태 규약 때문에 리스트·딕셔너리는 값 의미론이며, `add()`·`sort()` 등 제자리 변경 함수는 첫 인자가 변수이면 결과를 다시 저장합니다 (별칭은 함께 바뀌지 않음).

---

## 5. 다음 개발 로드맵 추천 후보
클로드에게 다음 작업을 지시할 때 아래 항목 중에서 지정하시면 됩니다:
1. ~~**매크로 슬로우모션 뷰어 & 비주얼 디버거 (`MacroDebugger`)**~~ — 레슨 53과 함께 구현 완료.
2. ~~**사용자 정의 Ex 커맨드 (`:command!`) 및 Vim 함수 엔진 (`:function`, `:call`)**~~ — 레슨 55·56과 함께 구현 완료. 리스트·딕셔너리·`:for`·`=~`·`substitute()`/`printf()`도 레슨 57과 함께 구현 완료. 남은 확장: 람다 `{x -> ...}`, `funcref`, `:try/:catch`, 커맨드라인 최상위 `:if`/`:for`.
3. **순정 Vim 맞춤법 검사기 (`:set spell`, `]s`, `[s`, `z=`, `zg`)**:
   - 코드 주석이나 문자열에서 오탈자를 탐색하고 `z=`로 교체 추천 목록을 띄우는 기능.
4. ~~**인덴트 텍스트 객체 확장 (`ii`, `ai`)**~~ — 레슨 54와 함께 구현 완료.
5. ~~**엔진 전역 실패 신호 (bell/abort)**~~ — `bell` 신호 및 연산자+모션(`dj`, `dl`, `db`, `dG` 등)과 함께 구현 완료.
