# ⌨️ VimPracticeOnWeb

브라우저에서 직접 키보드로 Vim 키바인딩과 모션, 텍스트 편집을 연습할 수 있는 인터랙티브 웹 애플리케이션입니다.

---

## ✨ 현재 지원하는 기능 (Features)

### 1. NORMAL 모드 모션 (Navigation)
* **기본 커서 이동**: `h` (좌), `j` (하), `k` (상), `l` (우) 및 방향키
  * 상/하 이동 시 짧은 줄에 대한 열(Column) 자동 클램핑
* **단어 단위 이동**:
  * `w`: 다음 단어의 첫 문자로 이동 (공백/기호/단어 경계 구분)
  * `b`: 이전 단어의 첫 문자로 이동
  * `e`: 단어의 마지막 문자로 이동
* **줄 단위 이동**:
  * `0`: 현재 줄의 맨 앞(0번 열)으로 이동
  * `$`: 현재 줄의 맨 끝 문자로 이동
  * `^`: 현재 줄의 첫 번째 공백이 아닌 문자로 이동
* **버퍼/파일 이동**:
  * `gg`: 버퍼의 첫 번째 줄로 이동 (2타 입력 버퍼 처리)
  * `G`: 버퍼의 마지막 줄로 이동

### 2. INSERT 모드 & 텍스트 편집 (Editing)
* **모드 전환**:
  * `i`: 현재 커서 위치에서 INSERT 모드 진입
  * `a`: 현재 커서 다음 칸에서 INSERT 모드 진입 (줄 끝 너머 추가 가능)
  * `Esc`: NORMAL 모드로 복귀 (커서 1칸 좌측 자동 보정)
* **텍스트 입력 및 수정**:
  * 모든 일반 문자 타이핑 및 공백(` `) 입력
  * `Backspace`: 현재 커서 앞 문자 삭제 (줄 맨 앞일 경우 이전 줄과 자동 병합)
  * `Enter`: 커서 위치에서 줄 분할 및 다음 줄 맨 앞으로 이동
  * `Tab`: 2칸 공백(`  `) 들여쓰기 삽입
  * INSERT 모드 내 방향키(`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`) 이동 지원
* **단일 문자 삭제**:
  * `x`: NORMAL 모드에서 현재 커서 위치의 글자 즉시 삭제 (줄 끝 삭제 시 커서 자동 클램핑)

### 3. 에디터 및 상태바 UI (Interface)
* **에디터**:
  * 1-indexed 라인 번호(Gutter) 렌더링
  * 현재 위치한 줄 활성 하이라이트 (`active-row`)
  * 모드별 커서 스타일 (NORMAL: 블록 커서, INSERT: 세로선 및 색상 전환)
* **상태바 (Status Bar)**:
  * 실시간 모드 배지 (`NORMAL`, `INSERT`)
  * 파일명 표시
  * 대기 중인 키 입력 표시 (`pendingKeys`, 예: `g`)
  * 커서 현재 위치 표시 (`줄:열`, 1-indexed)

---

## 🛠️ 기술 스택 (Tech Stack)

* **Frontend**: React 19, TypeScript, Vite
* **Testing**: Vitest, React Testing Library
* **Styling**: Modern CSS (Catppuccin Macchiato 테마 기반)

---

## 🚀 시작하기 (Getting Started)

### 설치
```bash
npm install
```

### 개발 서버 실행
```bash
npm run dev
```

### 테스트 실행 (Vitest)
```bash
npm test
```

### 프로덕션 빌드
```bash
npm run build
```

---

## 🗺️ 로드맵 (Upcoming Features)

- [x] **인터랙티브 미션/튜토리얼 코스**: 단계별 과제 수행 및 목표 도달 감지 UI (레슨 1~5 수록)
- [ ] **고급 편집 연산자**: 한 줄 삭제(`dd`), 단어 삭제(`dw`), 붙여넣기(`p`)
- [ ] **실행 취소/다시 실행**: Undo(`u`), Redo(`Ctrl + r`) 히스토리 스택
- [ ] **VISUAL 모드**: 문자/줄 단위 블록 선택(`v`, `V`) 및 일괄 삭제/복사
