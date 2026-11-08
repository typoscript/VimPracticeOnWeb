# vim-engine

순수 TypeScript로 만든 Vim 에디터 엔진입니다. React, DOM, 외부 라이브러리에 의존하지 않으며, **이 폴더 하나만 복사하면 브라우저·Node 어디서나 그대로 쓸 수 있습니다.**

에디터 상태를 넣고 키를 하나 주면 새 상태를 돌려주는 순수 함수 하나가 핵심입니다.

```ts
handleKey(state, key) => newState
```

모션·연산자·텍스트 객체·레지스터·매크로·`.` 반복·실행 취소 트리·Vim 정규식·`:s`·`:g`·Vim script·버퍼·창 분할·탭·퀵픽스·폴딩·키매핑·vim-surround 등을 지원합니다. 동작은 실제 Neovim 결과와 대조해 검증하고 있습니다.

## 다른 프로젝트에서 쓰기

1. 이 폴더(`vim-engine/`)를 통째로 복사합니다. `*.test.ts` 파일은 빼도 됩니다.
2. 이 폴더의 `index.ts`만 import 합니다. 내부 파일을 직접 import 하지 마세요.
3. TypeScript `strict` 모드와 ES2020 이상이면 됩니다. 이 폴더의 `tsconfig.json`이 단독 검사용 설정입니다.

## 빠른 시작

```ts
import { createVimState, sendKeys, handleKey, runExCommand, evalVimExpression } from './vim-engine';

let state = createVimState(['hello world', 'foo(a, b)']);

state = sendKeys(state, 'dw');              // Vim 표기법 문자열: ['world', 'foo(a, b)']
state = sendKeys(state, 'j0f(ci(x<Esc>');   // ['world', 'foo(x)']
state = handleKey(state, 'u');              // 키 하나씩: 실행 취소
state = runExCommand(state, '%s/o/0/g');    // Ex 명령 (앞의 : 는 생략 가능)

const { value } = evalVimExpression(state, "toupper(getline(1))");  // Vim script 표현식
```

상태는 불변 객체입니다. 매번 새 객체가 돌아오므로 이전 상태를 그대로 보관하면 됩니다. 렌더링은 `state.lines`, `state.cursor`, `state.mode`, `state.visualAnchor`를 읽어서 하면 됩니다.

## 설정

시작할 때 한 번만 호출합니다. 지정한 항목만 바뀝니다.

```ts
import { configureVimEngine } from './vim-engine';

configureVimEngine({
  devChecks: false,                  // true: 키마다 deepFreeze + 불변 조건 검사 (개발·테스트용, 느림)
  workspaceFiles: {                  // :e, :Explore, ctags, 파일 이름 자동완성이 보는 가상 파일
    'src/main.ts': ['console.log("hi");'],
  },
  vimrc: ['set number', 'inoremap jk <Esc>'],  // :e ~/.vimrc 로 열리는 내용
  locale: 'en',                      // 상태 표시줄 메시지·에러 언어: 'ko'(기본) 또는 'en'(실제 Vim 영어 문구)
});
```

`devChecks`는 기본적으로 Node의 `NODE_ENV`가 `development`나 `test`일 때만 켜집니다. 브라우저에서는 기본으로 꺼져 있습니다. Vite를 쓴다면 `configureVimEngine({ devChecks: import.meta.env.DEV })`처럼 지정하세요.

## 키 이름

`handleKey`와 배열을 받는 `sendKeys`는 아래 키 이름을 씁니다. 문자열을 받는 `sendKeys`는 오른쪽 Vim 표기법을 자동으로 바꿔 줍니다.

| 키 | 엔진 키 이름 | 문자열 표기 |
|---|---|---|
| 일반 문자 | `'a'`, `'A'`, `'$'`, `' '` | 그대로 |
| Esc / Enter / Backspace / Tab | `'Escape'`, `'Enter'`, `'Backspace'`, `'Tab'` | `<Esc>`, `<CR>`, `<BS>`, `<Tab>` |
| Ctrl 조합 | `'Ctrl-a'`, `'Ctrl-r'`, `'Ctrl-w'` | `<C-a>`, `<C-r>` |
| 방향키 | `'ArrowUp'` … `'ArrowRight'` | `<Up>` … `<Right>` |

브라우저의 `KeyboardEvent.key`는 대부분 그대로 넘기면 됩니다. Ctrl 조합만 `'Ctrl-' + key`로 바꿔 주세요.

## 공개 API

| 분류 | 함수 |
|---|---|
| 핵심 | `handleKey`, `createVimState`, `sendKeys`, `runExCommand`, `executeCommandLine`, `parsePending` |
| 설정 | `configureVimEngine`, `getVimEngineConfig` |
| 상태 타입 | `VimEditorState`, `VimMode`, `CursorPosition`, `VimOptions` 등 (`types.ts` 전체) |
| 화면용 보조 | `isPositionSelected`(선택 영역 판정), `findMatches`(검색 하이라이트), `computeDiffHunks`, `switchPaneFocus`, `switchBuffer`, `switchTab`, `openNewTab`, `closeTab`, `jumpToQuickfixItem` 등 |
| Vim 정규식 | `compileVimRegex`(Vim 패턴 → `RegExp`), `translateVimPattern`, `escapeVimPattern` |
| Vim script | `evalVimExpression`, `evaluateVimScript`, `VimScriptError`, `formatValue`, `displayValue` |
| 매크로 디버거 | `buildMacroTrace`(매크로를 키 단위 상태 프레임으로 분해), `getMacroKeys`, `listMacroRegisters` |
| 개발용 | `withInvariantCheck`, `assertValidVimState`, `deepFreeze` |

## 알아둘 점

- **실패 신호**: Vim이 beep 하는 상황(마지막 줄에서 `j` 등)에서는 결과 상태에 `bell: true`가 남습니다. 다음 키를 누르면 사라지며, 화면에서 깜빡임 효과를 줄 때 쓰면 됩니다.
- **메시지 언어**: `state.commandMessage`의 에러·안내 메시지는 한국어입니다. 에러 번호(`E486` 등)는 Vim과 같습니다.
- **Vim script 리스트·딕셔너리**: 불변 상태 규약 때문에 값 의미론으로 동작합니다. `call add(l, x)`처럼 첫 인자가 변수이면 결과를 그 변수에 다시 저장하지만, `let b = a`로 만든 별칭은 함께 바뀌지 않습니다.
- **클립보드**: 시스템 클립보드(`"+`)는 엔진 안의 레지스터일 뿐입니다. 실제 OS 클립보드와 연결하려면 앱에서 직접 처리하세요.
- **테스트 파일**: 이 폴더의 `*.test.ts` 일부는 원래 프로젝트의 테스트 설정(데모 워크스페이스 주입)을 전제로 합니다. 복사해 갈 때는 빼거나, 같은 설정을 해 주세요.

## 독립성 검사

원래 프로젝트에서는 아래 두 가지가 이 폴더의 독립성을 계속 확인합니다.

- `npm run check:vim-engine`: DOM 타입 없이 이 폴더만으로 타입 검사
- `moduleBoundary.test.ts`: 폴더 밖 import 금지, `process`/`window`/`document` 사용 금지, 앱은 `index.ts`만 import
