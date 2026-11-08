# VimPracticeOnWeb 개발 가이드 & 프로젝트 규약 (AGENTS.md = CLAUDE.md)

> 모든 AI 코딩 에이전트(Claude Code, Gemini·Antigravity, Codex 등)가 공통으로 따르는 규약입니다.
> `AGENTS.md` 와 `CLAUDE.md` 는 **항상 같은 내용**이어야 합니다. 어느 쪽을 고쳐도 되며, `scripts/syncAgentDocs.mjs` 가 바뀐 쪽을 다른 쪽에 복사합니다 (git pre-commit 훅, `npm run sync:docs`). 두 파일이 다르면 `test/agentDocs.test.ts` 가 실패합니다.

## 1. 프로젝트 개요 & 아키텍처 원칙
- **프로젝트 명칭**: VimPracticeOnWeb
- **목적**: 브라우저에서 실제 터미널 Neovim/Vim과 100% 동일한 키바인딩과 감각을 연습할 수 있는 고정밀 인터랙티브 웹 애플리케이션
- **핵심 아키텍처**:
  - UI 렌더링은 React + Vite 기반이며, Vim 에디터 동작은 **`src/vim-engine/`에 위치한 순수 함수형 불변 상태 머신(Pure Functional State Machine)**으로 구동됩니다.
  - 외부 라이브러리 플러그인에 의존하지 않고, 모든 Vim 모션·연산자·레지스터·매크로·정규식 치환·버퍼·윈도우 분할·탭·퀵픽스·로케이션 리스트·마크·키매핑·서라운드 엔진이 TypeScript 순수 로직으로 구현되어 있습니다.
  - 상태 변이는 항상 `handleKey(state, key) => newState`를 통해 불변 객체 복제 방식으로 처리됩니다.
- **독립 모듈 `src/vim-engine/`**: 엔진은 이 폴더 하나로 완결된 모듈입니다(사용법: `src/vim-engine/README.md`).
  - 상태 타입은 `src/vim-engine/types.ts`에 있습니다. 앱·테스트 코드는 **반드시 `src/vim-engine/index.ts`(공개 API)만** import 하세요. 내부 파일을 직접 import 하면 `moduleBoundary.test.ts`가 실패합니다. 새로 바깥에서 써야 하는 함수가 생기면 `index.ts`에 export 를 추가하세요.
  - 엔진 코드는 폴더 밖 파일·외부 패키지를 import 하지 않고 `process`/`window`/`document`/`localStorage`/`import.meta`를 쓰지 않습니다. 환경 값은 `configureVimEngine({ devChecks, workspaceFiles, vimrc, locale })`로 주입합니다 (앱: `src/main.tsx`, 테스트: `src/test/setup.ts`, 데모 데이터: `src/data/demoWorkspace.ts`).
  - `npm run check:vim-engine` 으로 DOM 타입 없이 엔진 폴더만 단독 타입 검사합니다.

---

## 2. 빌드 및 테스트 명령어
- **단위 테스트 실행 (단일 파일)**:
  `npm test -- src/vim-engine/vimEngine.test.ts --run`
- **전체 테스트 스위트 실행**:
  `npm test -- --run`
  *(현재 114개 테스트 파일, 1,478개 테스트 100% 통과 필수)*
- **TypeScript 타입 체크 및 Vite 프로덕션 빌드**:
  `npm run build`
  *(strictNullChecks 및 noUnusedLocals 활성화 상태로 TS6133 등 미사용 변수 에러 발생 주의)*
- **로컬 개발 서버 실행**:
  `npm run dev`
- **번들 분할**: 아케이드·던전·도장 탭과 커스텀 미션·분석·데일리·설정 내보내기·BYOC 모달은 `App.tsx`에서 `React.lazy`로 지연 로딩되고, React는 `react-vendor`, Vim 엔진은 `vim-engine` 청크로 분리됩니다(`vite.config.ts`). 모달은 `useOpenedOnce`로 처음 열 때 불러온 뒤 마운트를 유지합니다. 이 화면들을 테스트할 때는 처음 나타나는 요소를 `await screen.findBy...`로 기다리세요.
- **한/영 화면 언어 (`src/i18n/`)**: 화면 문구는 한국어 원문을 키로 쓰는 `t('한국어', { name })` 로 출력하고, 영어는 `src/i18n/en.ts` 의 `{ 한국어: English }` 사전에서 찾습니다(자리표시자 `{name}` 은 원문과 같아야 함). 모듈 최상위 상수는 `localized({...})` 로 감싸 읽을 때 번역되게 하고, localStorage 에 남기는 값은 번역하지 말고 `i18nKey('한국어')` 로 원문을 저장한 뒤 화면에서 `t(key)` 로 번역하세요. 언어는 `useLocale()`/`setLocale()` (저장 키 `vim_locale_v1`, 없으면 브라우저 언어), 헤더의 `toggle-locale-btn` 으로 바꿉니다. 테스트는 `setup.ts` 에서 한국어로 고정됩니다. 레슨·던전·자유 연습장 본문은 `src/data` 에 한국어 원문 그대로 두고 화면에서 `t(mission.title)` 처럼 번역하며, 영어는 `src/i18n/enContent.ts`(`EN_CONTENT`)에 있습니다. 레슨 에디터 버퍼(`initialLines`/`targetLines`)는 `checkComplete` 가 그대로 비교하므로 번역하지 말고 영어로 작성하세요. ⚠ 새 문구나 레슨을 추가하면 `en.ts`/`enContent.ts` 에도 넣어야 `src/i18n/i18nCoverage.test.ts` 가 통과합니다. 엔진 메시지(`commandMessage`, Vim script 에러)는 엔진 안의 `msg('한국어', { name })`(`src/vim-engine/messages.ts`)로 만들고, `configureVimEngine({ locale: 'en' })` 이면 `src/vim-engine/messagesEn.ts` 의 실제 Vim 영어 문구(`E492: Not an editor command: foo`, `3 fewer lines`)를 씁니다. 앱의 `setLocale()` 이 엔진 locale 도 함께 맞춥니다. ⚠ 엔진에 새 메시지를 추가하면 `messagesEn.ts` 에도 넣어야 `src/vim-engine/messages.test.ts` 가 통과합니다(E번호·자리표시자 일치 검사).

- **작업 완료 체크리스트 (모든 에이전트 공통)**: 변경 후 `npm test -- --run`, `npm run build`, `npm run check:vim-engine` 가 모두 통과해야 합니다. 화면 문구·레슨·엔진 메시지를 추가했다면 영어 사전(`src/i18n/en.ts`, `src/i18n/enContent.ts`, `src/vim-engine/messagesEn.ts`)도 함께 채우세요. 규약이 바뀌면 이 문서의 현황·테스트 개수를 갱신하세요. (`CLAUDE.md`/`AGENTS.md` 중 하나만 고쳐도 커밋할 때 자동으로 맞춰집니다)

---

## 3. 핵심 개발 및 불변성(Invariants) 규약
1. **불변 상태 관리 (State Immutability)**:
   - `state`의 lines, cursor, marks, registers 등은 절대로 직접 변경(mutate)하지 않고 항상 스프레드 연산자나 새 배열/객체 복사로 반환합니다.
   - `devChecks`가 켜진 환경(개발 서버·테스트)에서 `deepFreeze(state)`가 적용되며, `assertValidVimState` 불변성 검사를 통과해야 합니다.
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
   - (i18n) `src/i18n/enContent.ts`: 신규 레슨의 `title`·`description`·`hint` 영어 번역 추가.

---

## 4. 현재 구현 완료 현황 (레슨 1 ~ 64)
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
- **매크로 심화 & 디버깅 (레슨 53)**: `@a, @@, [count]@@` + 매크로 슬로우모션 디버거 (`src/vim-engine/macroDebugger.ts`, `src/components/MacroDebugger/`: 1x/0.5x/0.2x 재생, 키 단위 스텝, 프레임 미리보기).
- **실패 신호(bell) & 연산자+모션**: 실패한 키는 상태에 일시적 `bell: true`를 남기며(매 키 입력 시작 시 제거), `@` 매크로·`.` 반복·`:normal`·키매핑 재생은 bell에서 중단됩니다. `src/vim-engine/operatorMotion.ts`가 `d/c/y` + `j k G gg`(줄 단위), `h l b B ^`(배타적 문자 단위)를 처리하며 실패 시 bell을 울립니다. UI는 bell마다 에디터 테두리를 깜빡입니다(visualbell, `Editor`의 `bellSignal`). VISUAL 모드 모션, `%`, `*`/`#`(E348), 미설정 마크(E20), 빈 레지스터 `p`(E353), 마지막 줄 `J`, 숫자 없는 `Ctrl-a`, 줄보다 긴 `[count]r`, 알 수 없는 Ex 명령(E492)도 bell을 울립니다. ⚠ Vim `nv_wordcmd`처럼 연산자와 함께 쓴 `e`는 버퍼 끝에서도 실패하지 않습니다(`de`는 마지막 문자 삭제) — 판정 기준은 Vim 소스와 `test/vimDifferential.fuzz.test.ts`.
- **순정 Vim 정규식 (`src/vim-engine/vimRegex.ts`의 `compileVimRegex`)**: `/` `?` `n` `N` `*` `#` `gn` 하이라이트, `:s`, `:g`, `:/pat/` 범위, `:vimgrep`, `:lvimgrep`, `=~`, `substitute()`/`split()`/`match()` 가 모두 같은 변환기를 씁니다. magic 기본 모드에서 `+ ? = | ( ) { } < >`는 리터럴이며 `\` 를 붙여야 특수 문자입니다(`\+`, `\(…\)`). `\v`/`\m`/`\M`/`\V`, `\zs`/`\ze`, `\{-}`, `\%(`, `\@=` 류, `\a \l \u \x \h \k`, `[[:alpha:]]`, `\c`/`\C`, smartcase(`\` 뒤 대문자 제외)를 지원합니다. `*`/`#`은 `\<word\>` 로 단어 전체를 찾습니다. ⚠ 새 코드에서 Vim 패턴을 다룰 때 `new RegExp(pattern)` 을 직접 쓰지 말고 반드시 `compileVimRegex` 를 사용하세요.
- **`:s` 고급 기능 (레슨 59)**: `\=expr` 계산식 치환(`submatch(n)`, 치환 중인 줄이 `line('.')`, 리스트 결과는 여러 줄), `\r` 줄 나누기, 치환 문자열·패턴의 `~`(직전 치환 문자열), 빈 패턴 `:s//new/`, `:&` / `:&&` / 인자 없는 `:s`, 노멀 `&` / `g&`. 대소문자는 `I`(구분) > `i`(무시) > `ignorecase`+`smartcase` 순이며 `gc` 확인 모드도 같은 값을 씁니다. 직전 치환은 `state.lastSubstitute`, 성공한 `:s` 패턴은 `lastSearchQuery` 가 됩니다.
- **자주 쓰는 명령 정리**: `>`/`<` + 모든 모션·텍스트 객체(`>ip`, `>}`, `>i{`; 임시 상태에서 모션/`v`+객체를 실행해 줄 범위 계산, exclusive 모션이 아래 줄 첫 칸에서 끝나면 그 줄 제외, 빈 줄은 들여쓰지 않음), `[count]p/P`(내용을 반복해 한 번에), `ga`, `:noh`(`hlsearchSuppressed`, 다음 검색·`n`에서 해제), `:t0`/`:m0`, `i<`/`a<`, `g?`(ROT13, `g??`·`g?g?`), `gUgU`, VISUAL `[(` 류. 여러 줄 `i{`/`i(`는 Vim `current_block` 규칙대로 `{` 줄과 `}` 줄을 남기는 줄 단위 객체입니다.
- **실제 Neovim 으로 동작 확인**: 이 컴퓨터에는 `nvim` 이 있습니다. `nvim --headless -u NONE -i NONE` 으로 키 시퀀스를 실행해 결과를 확인하세요. CodeMirror 오라클(`test/oracle`)이 실제 Vim 과 다른 경우에는 `test/vimDifferential*.test.ts` 에서 Neovim 으로 확인한 결과와 비교합니다(`NEOVIM_VERIFIED_CASES`, `runAgainstNeovim`).
- **보조 모션 (레슨 60, `src/vim-engine/extraMotions.ts`)**: `(` `)` 문장(exclusive), `ge` `gE` 이전 단어 끝(inclusive, 뒤로), `g_`(inclusive), `+` `-` `Enter`(줄 단위), `[count]|`(exclusive), `[(` `[{` `])` `]}` 짝 없는 괄호(exclusive, 여러 줄). 노멀·VISUAL·`d/c/y`·`.` 반복·bell 지원. 연산자 처리는 `operatorMotion.ts`가 모션 종류(inclusive/exclusive/linewise)로 분기합니다.
- **문단·문장 텍스트 객체 (레슨 58)**: `ip`/`ap`(Vim `current_par()` 규칙, 공백만 있는 줄도 빈 줄, 줄 단위), `is`/`as`(문자 단위, 여러 줄 문장, 앞뒤 공백은 같은 줄까지). 카운트는 `2dap`·`d2ap` 모두 지원 (`textObjects.ts`의 `getParagraphObjectRange`, `getSentenceObjectRange`, `executeLinewiseObjectOperator`).
- **인덴트 텍스트 객체 (레슨 54)**: `ii, ai, iI, aI, [count]ii` + `d/c/y/v/=/gu/gU/g~` (`textObjects.ts`의 `getIndentObjectRange`, `executeIndentObjectOperator`, 항상 줄 단위)
- **사용자 정의 Ex 명령 (레슨 55)**: `:command[!] [-nargs] [-range[=%]] [-bang] Name ...`, `:delcommand`, `:comclear`, `:command` 목록, `<args> <q-args> <line1> <line2> <bang> <lt>` 치환, 접두어 호출, `.vimrc` 소싱 (`src/vim-engine/userCommandEngine.ts`). 내장 명령이 먼저 평가되어 사용자 명령에 가려지지 않습니다. `<f-args>`로 함수에 인자를 나눠 전달합니다.
- **Vim script 함수 (레슨 56)**: `:function[!] Name(a, ...) [range] [abort]` → 커맨드라인 본문 입력(`functionDraft`) → `:endfunction`, `:delfunction`, `:[range]call`(range 속성 없으면 줄마다 호출), `:let`/`:unlet`/`:echo`/`:execute`, 본문의 `return`·`if/elseif/else/endif`·`while/break/continue`. 표현식은 `src/vim-engine/vimscriptEval.ts`(숫자·문자열, g:/l:/a:/@r, 내장 함수), 실행은 `src/vim-engine/vimscriptEngine.ts`. `:call` 하나는 한 번의 실행 취소 단위입니다.
- **Vim script 리스트·딕셔너리 (레슨 57)**: `[1, 'a']`, `{'k': v}`, `#{k: v}`, 인덱스·슬라이스(`l[1:]`, `s[-3:]`), `d.key`, `=~`/`!~`, `is`, `:for x in list` / `:for [k, v] in items(d)`, `:let l[0] = x` / `:let [a, b; rest] = list`, `:unlet d.k`, `a:000`, 내장 함수(`substitute`, `printf`, `map`, `filter`, `sort`, `split`, `join`, `range`, `keys`, `items` 등). Vim 정규식 변환은 `src/vim-engine/vimRegex.ts`(아래 '순정 Vim 정규식' 참고). ⚠ 불변 상태 규약 때문에 리스트·딕셔너리는 값 의미론이며, `add()`·`sort()` 등 제자리 변경 함수는 첫 인자가 변수이면 결과를 다시 저장합니다 (별칭은 함께 바뀌지 않음).
- **순정 Vim 맞춤법 검사기 (레슨 61, `src/vim-engine/spellEngine.ts`, `spellData.ts`)**: `:set spell`, `:set nospell`, `]s`, `]S`, `[s`, `[S`, `z=`, `zg`, `zw`. 표준 Vim 영단어 사전(2,000+ 단어) 기반 오류 감지 및 Damerau-Levenshtein 거리 기반 맞춤법 추천(`z=`), 번호 선택 및 교체 실행 취소(undo) 지원. `Editor.tsx` 오탈자 빨간 물결 밑줄 렌더링, `StatusBar.tsx`의 `[SPELL]` 활성 배지 표시.
- **고급 Vim script 엔진 및 람다 정렬 (레슨 62, `src/vim-engine/vimscriptEval.ts`, `vimscriptEngine.ts`)**: 람다 표현식 `{ [args] -> expr }` (`{x -> x * 2}`, `{a, b -> a + b}`, `{-> 42}`), 클로저 변수 캡처(상위 함수 `a:`, `l:` 스코프 접근), 딕셔너리 메서드 호출 및 `self` 바인딩 (`d.method()`). 함수 참조 `function('fn' [, args [, dict]])`, `funcref(...)`, `call(fn, args [, dict])`, `type(fn) == 2` (`v:t_func`), 부분 적용(partial application), 고차 함수 (`map()`, `filter()`, `sort()`에 람다 전달, 레슨 62의 길이순 라인 정렬 `{a, b -> len(a) - len(b)}`). 예외 처리 `:try`, `:catch [ /pattern/ ]`, `:finally`, `:endtry`, `:throw expr`, 내장 런타임 에러(E-number) 포착, `v:exception` 변수 지원, `:try` 블록 내 조기 `:return` 시에도 `:finally` 실행 보장.
- **커맨드라인 파이프(`|`) 및 최상위 제어문 (레슨 63, `src/vim-engine/commandLine.ts`, `vimscriptEngine.ts`)**: `:bar` (`|`) 다중 Ex 커맨드 연속 실행. 따옴표(`"`, `'`), 역슬래시 이스케이프(`\|`), 논리 OR(`||`), 치환 패턴(`:%s/.../.../`), `:global`/`:vglobal` 인라인 패턴 보존. 실패 시(`bell: true`) 후속 명령 중단. 최상위 파이프 제어문(`:if/:else/:endif`, `:for/:endfor`, `:while/:endwhile`, `:try/:catch/:finally/:endtry`) 자동 라인 분기 및 스크립트 블록 실행, 고립된 제어문 키워드에 대한 표준 Vim 에러(`E171`, `E170`, `E580` 등) 처리. 레슨 63에서 `:%s` 치환과 한 줄 `:for` 루프 파이프 연결 자동화 실전 훈련 제공.
- **인버퍼 및 파일/라인 자동완성 팝업 메뉴 (레슨 26, 43, `completion.ts`, `Editor.tsx`)**: `Ctrl+n`, `Ctrl+p`, `Ctrl+x Ctrl+f`, `Ctrl+x Ctrl+l`. 1자 이상 접두사 지원, 커서 주변 순환 근접 탐색(proximity scanning), 분할 창 및 타 버퍼 단어 수집, 마우스 클릭 선택(`selectCompletionCandidate`), 활성 항목 자동 스크롤(scrollIntoView), 뷰포트 하단 공간 부족 시 상향 팝업(open-upward).
- **퀵픽스/로케이션 리스트 전용 분할 창(Split Window) 시각 렌더링 (`src/components/QuickfixPanel/`)**: `:copen [height]` 및 `:lopen [height]` 실행 시 에디터 하단에 도킹되는 순정 Vim 수평 분할 창 시각화. split statusline 헤더(`[Quickfix List] {file} ({curr} of {total})`), `[height]` 높이 제약 동적 반영, 구문 하이라이트(라인:컬럼, `[E]`/`[W]`/`[I]` 배지, 에러 메시지), 활성 항목 커서 표시(`▶ `) 및 `:cn`/`:cp`/`:lne`/`:lp` 이동 시 활성 항목 자동 스크롤(`scrollIntoView`), 항목 클릭 즉시 커서 점프, `:cclose`/`:lclose`/`✕` 닫기 지원.
- **던전 RPG (DungeonRPG) 스테이지 6 카오스 드래곤 최종 결전 (`src/components/DungeonRPG/`, `src/data/dungeonStages.ts`)**: 3중 중첩 쉴드(`[<"CHAOS_DRAGON">]`)와 마력 코어(`{CORE}`)를 가진 최종 보스 스테이지. 신규 스킬 `dragon_slayer`(용살검 오의 `ci"/da</da[`) 및 `grand_master`(신화의 경지) 해금, Par 초과 시 드래곤 분노(Enrage) 화염 이펙트 및 경고, 처치 후 궁극의 차원문(`E`) 탈출 및 특별 칭호(`👑 [Grandmaster of Vim - 전설의 용살자]`) 수여.
- **순정 Netrw 프로젝트 탐색기 & 버퍼/파일 제어 (레슨 39, 64, `src/vim-engine/netrwEngine.ts`, `vfs.ts`)**: `:Explore`, `:Hexplore` (`:He`), `:Sexplore` (`:Se`), `:Vexplore` (`:Ve`), `:Texplore` (`:Te`). 디렉터리 브라우징(`j/k`, `Enter`, `-`), 신규 파일 생성(`%`), 신규 폴더 생성(`d`), 파일 삭제(`D`), 분할 창/새 탭 열기(`v`/`o`/`t`), `virtualFiles` 가상 파일 시스템 맵 영구 보존 및 버퍼 상호 전환(`Ctrl-^`). 레슨 64에서 Netrw 탐색기 분할 실행, 하위 폴더 진입, `%` 신규 파일 생성 및 대상 파일 수정 후 원래 버퍼로의 복귀 실전 통합 마스터.
- **미션 검색 및 필터링 시스템 (`src/components/LessonSelectModal/`, `src/utils/missionFilters.ts`)**: 커리큘럼 모달 내 실시간 통합 검색(ID, 제목, 설명, 힌트, 단축키) 및 6개 핵심 카테고리 태그(기초, 모션, 텍스트객체, Ex 커맨드, Vimscript, Netrw) 필터링, 미완료 레슨 선별 토글, 레슨 카드별 컬러 태그 배지 렌더링 및 빈 검색 결과 상태/필터 초기화 지원.
- **아케이드 서바이벌 보스전 & 파워업 아이템 시스템 (`src/components/ArcadeSurvival/`, `types/game.ts`)**: Wave 5 미니보스 `[👑 MINI-BOSS] GIGANTIC_MEMORY_LEAK` 및 Wave 10 최종 보스 `[👾 MEGA-BOSS] TITAN_KERNEL_PANIC` 신규 보스전 확장. 3종 파워업 스킬 시스템 — ⏳ **시간 정지 (Chrono Freeze - `Ctrl+z`)**: 5.0초간 생존 타이머 동결 및 HUD 카운트다운, 💣 **버그 폭탄 (Bug Annihilator Bomb - `Ctrl+b`)**: 현재 웨이브 버그 즉시 섬멸 및 점수 획득, 🛡️ **콤보 & 생명선 쉴드**: 3콤보마다 충전되며 방향키 오입력 페널티 흡수 및 타임아웃 시 +5초 비상 회생. 보스 출현/격퇴 경고 배너 및 보너스 점수(+500 / +1000) & 파워업 전면 재충전.
- **글로벌 프로젝트 텍스트 치환 & 배치 실행 엔진 (`:cdo`, `:cfdo`, `:ldo`, `:lfdo`, `:bufdo`, `:tabdo`, `:argdo`)**: `:vimgrep` / `:lvimgrep` 결과 기반 퀵픽스 및 로케이션 리스트 순회 일괄 치환(`:cdo`, `:cfdo`, `:ldo`, `:lfdo`), 열려 있는 버퍼(`:bufdo`) 및 탭페이지(`:tabdo`) 일괄 실행, `splitPipedCommands`의 내부 파이프라인 보존(`:cdo s/a/b/ | update`), 가상 파일 시스템(`vfs`) 자동 버퍼 로드, `!`(bang) 에러 무시 및 실패 시(`bell: true`) 중단 제어 지원.

---

## 5. 다음 개발 로드맵 추천 후보
에이전트에게 다음 작업을 지시할 때 아래 항목 중에서 지정하시면 됩니다:
1. ~~**매크로 슬로우모션 뷰어 & 비주얼 디버거 (`MacroDebugger`)**~~ — 레슨 53과 함께 구현 완료.
2. ~~**사용자 정의 Ex 커맨드 (`:command!`) 및 Vim 함수 엔진 (`:function`, `:call`)**~~ — 레슨 55·56과 함께 구현 완료. 리스트·딕셔너리·`:for`·`=~`·`substitute()`/`printf()`도 레슨 57과 함께 구현 완료.
3. ~~**순정 Vim 맞춤법 검사기 (`:set spell`, `]s`, `[s`, `z=`, `zg`)**~~ — 레슨 61 연계 및 스펠링 체크 엔진 구현 완료.
4. ~~**인덴트 텍스트 객체 확장 (`ii`, `ai`)**~~ — 레슨 54와 함께 구현 완료.
5. ~~**엔진 전역 실패 신호 (bell/abort)**~~ — `bell` 신호 및 연산자+모션(`dj`, `dl`, `db`, `dG` 등)과 함께 구현 완료.
6. ~~**레슨 61 추가 (스펠링 체크 마스터)**~~ — 구현 완료.
7. ~~**고급 Vim script 기능**~~ — 람다 표현식 `{x -> expr}`, `funcref('func')` 및 `function()`, 부분 적용, `call()`, `:try/:catch/:finally` 예외 처리 블록 구현 완료.
8. ~~**신규 레슨 62 추가 (고급 Vim script 람다 정렬)**~~ — 구현 완료.
9. ~~**Neovim/Vim 순정 단어 자동완성 (`Ctrl+n` / `Ctrl+p`) 및 팝업 메뉴 UI**~~ — 구현 완료.
10. ~~**커맨드라인 최상위 블록 (`:if`/`:for`/`:while`) 지원**~~ — 파이프(`|`) 다중 명령 실행 및 제어 흐름 스크립트 블록 구현 완료.
11. ~~**퀵픽스/로케이션 리스트 전용 분할 창(Split Window) 시각 렌더링**~~ — 구현 완료 (`src/components/QuickfixPanel/`).
12. ~~**신규 레슨 63 추가 (커맨드라인 파이프 및 제어 흐름 한 줄 자동화)**~~ — 구현 완료.
13. ~~**던전 RPG (DungeonRPG) 스테이지 6 신규 보스 및 메카닉 확장**~~ — 구현 완료.
14. ~~**신규 레슨 64 추가 (Netrw 프로젝트 탐색기 & 버퍼/파일 제어)**~~ — 레슨 64와 함께 구현 완료.
15. ~~**미션 검색 및 필터링 기능 (Mission Search & Tags)**~~ — 구현 완료.
16. ~~**아케이드 서바이벌 신규 보스 & 파워업 아이템 확장**~~ — 구현 완료.
17. ~~**글로벌 프로젝트 텍스트 치환 & 퀵픽스/아규먼트 리스트 연계**: `:vimgrep` / `:cdo` / `:cfdo` 및 `:argdo` 대규모 리팩토링 실무 마스터.~~ — 구현 완료.
18. **신규 레슨 65 추가 (글로벌 프로젝트 리팩토링과 :cdo / :cfdo 마스터)**: 다중 파일 검색 치환 실전 레슨.
19. **하드코어 도장 (HardcoreDojo) 연속 서든데스 챌린지**: 노미스 10연타 스피드런 및 실시간 랭킹 시스템.
