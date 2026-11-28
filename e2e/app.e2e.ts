import { expect, test, type Page } from '@playwright/test';

/**
 * 실제 브라우저에서만 확인할 수 있는 흐름을 검사합니다.
 * (jsdom 단위 테스트가 다루지 못하는 실제 keydown 처리, 브라우저 단축키 차단, 한글 IME 키 매핑, 지연 로딩 화면)
 */

async function openApp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./');
  await expect(page.getByTestId('mission-title')).toContainText('1');
  await expect(page.getByTestId('status-mode')).toContainText('NORMAL');
  return errors;
}

async function pressKeys(page: Page, keys: string[]): Promise<void> {
  for (const key of keys) await page.keyboard.press(key);
}

test('레슨 1 을 모범 풀이로 완료하면 클리어 배너가 뜨고 새로고침 후에도 기록이 남는다', async ({ page }) => {
  const errors = await openApp(page);

  await pressKeys(page, ['j', 'j', 'w', 'w', 'w']);
  await expect(page.getByTestId('status-cursor-pos')).toHaveText('3:14');
  await expect(page.getByTestId('mission-success-banner')).toBeVisible();

  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('vim_practice_progress_v1') ?? '{}'));
  expect(progress['1']).toMatchObject({ completed: true, bestStars: 3, minKeystrokes: 5 });

  // 새로고침 후 커리큘럼 목록에서 레슨 1 이 완료로 표시됩니다.
  await page.reload();
  await page.getByTestId('open-lesson-modal-btn').click();
  await expect(page.getByTestId('lesson-card-1')).toHaveClass(/completed-lesson/);
  await expect(page.getByTestId('lesson-card-2')).not.toHaveClass(/completed-lesson/);
  expect(errors).toEqual([]);
});

test('Ex 명령줄로 치환하면 버퍼가 바뀌고 u 로 되돌린다', async ({ page }) => {
  await openApp(page);

  await page.keyboard.press(':');
  await expect(page.getByTestId('commandline-prompt')).toBeVisible();
  await page.keyboard.type('s/Welcome/Hello/');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('editor-row-1')).toContainText('Hello to Vim Lesson 1!');

  await page.keyboard.press('u');
  await expect(page.getByTestId('editor-row-1')).toContainText('Welcome to Vim Lesson 1!');
});

test('Ctrl+v 는 브라우저 붙여넣기 대신 VISUAL BLOCK 모드로 들어간다', async ({ page }) => {
  await openApp(page);

  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('status-mode')).toContainText('BLOCK');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('status-mode')).toContainText('NORMAL');
});

test('한글 IME 상태로 누른 키도 물리 키 위치대로 Vim 명령으로 처리된다', async ({ page }) => {
  await openApp(page);

  // 한글 2벌식에서 J 자리는 'ㅓ' 입니다. 실제 IME 처럼 key 는 한글, code 는 KeyJ 로 보냅니다.
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ㅓ', code: 'KeyJ', bubbles: true, cancelable: true })
    );
  });
  await expect(page.getByTestId('status-cursor-pos')).toHaveText('2:1');
});

test('언어를 영어로 바꾸면 레슨 문구가 번역되고 새로고침 후에도 유지된다', async ({ page }) => {
  await openApp(page);

  await page.getByTestId('toggle-locale-btn').click();
  await expect(page.getByTestId('mission-title')).toContainText('Lesson 1: Basic Movement');

  await page.reload();
  await expect(page.getByTestId('mission-title')).toContainText('Lesson 1: Basic Movement');
});

test('자유 연습장 탭은 지연 로딩된 뒤 바로 편집할 수 있다', async ({ page }) => {
  const errors = await openApp(page);

  await page.getByTestId('tab-sandbox-btn').click();
  await expect(page.getByTestId('sandbox-panel')).toBeVisible();
  const firstLine = page.getByTestId('editor-row-1');
  const before = (await firstLine.textContent()) ?? '';

  await page.keyboard.press('x');
  await expect(firstLine).not.toHaveText(before);
  await page.keyboard.press('u');
  await expect(firstLine).toHaveText(before);
  expect(errors).toEqual([]);
});

test('Ctrl+/ 로 키 사전을 열어 키 설명·이어지는 키·입력 모드 탭·레슨 이동을 쓰고 Esc 로 닫는다', async ({ page }) => {
  const errors = await openApp(page);
  const modal = page.getByTestId('key-reference-modal');
  const detail = page.getByTestId('key-reference-detail');

  await page.keyboard.press('Control+/');
  await expect(modal).toBeVisible();
  await expect(page.getByTestId('key-reference-mode-normal')).toHaveAttribute('aria-selected', 'true');

  // 창이 열린 동안 누른 키는 에디터로 가지 않고 설명만 보여 줍니다.
  await page.keyboard.press('w');
  await expect(detail).toContainText('다음 단어 시작');
  await expect(page.getByTestId('status-cursor-pos')).toHaveText('1:1');

  // 접두 키 g 는 이어서 누르는 키 목록을 함께 보여 줍니다.
  await page.keyboard.press('g');
  await expect(detail).toContainText('이어서 누르는 키');
  await expect(detail.locator('.keyref-followups-list li').first()).toBeVisible();

  // 입력 모드 탭에서는 입력 모드의 키 설명을 보여 줍니다.
  await page.getByTestId('key-reference-mode-insert').click();
  await expect(page.getByTestId('key-reference-mode-insert')).toHaveAttribute('aria-selected', 'true');
  // 키를 눌러도, 목록에서 클릭해도 고를 수 있습니다.
  await page.getByTestId('key-reference-key-Ctrl-w').click();
  await expect(detail).toContainText('앞 단어 지우기');

  // 노멀 모드 x 를 고르고 그 키를 연습하는 레슨으로 이동합니다.
  await page.getByTestId('key-reference-mode-normal').click();
  await page.keyboard.press('x');
  const lessonLink = page.getByTestId('key-reference-lessons').locator('[data-testid^="key-reference-lesson-"]').first();
  await expect(lessonLink).toBeVisible();
  const lessonTitle = (await lessonLink.getAttribute('title')) ?? '';
  expect(lessonTitle).not.toBe('');
  await lessonLink.click();
  await expect(modal).toBeHidden();
  await expect(page.getByTestId('mission-title')).toContainText(lessonTitle);

  // 다시 열고 Esc 로 닫습니다.
  await page.keyboard.press('Control+/');
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page.getByTestId('status-mode')).toContainText('NORMAL');
  expect(errors).toEqual([]);
});

test('입력 모드에서 키 사전을 열면 입력 모드 탭부터 보여 준다', async ({ page }) => {
  await openApp(page);

  await page.keyboard.press('i');
  await expect(page.getByTestId('status-mode')).toContainText('INSERT');
  await page.keyboard.press('Control+/');
  await expect(page.getByTestId('key-reference-modal')).toBeVisible();
  await expect(page.getByTestId('key-reference-mode-insert')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('key-reference-modal')).toBeHidden();
});

test('Alt+W 는 Ctrl-w 로 들어가 분할 창 사이를 옮긴다 (레슨 24)', async ({ page }) => {
  await openApp(page);

  await page.getByTestId('open-lesson-modal-btn').click();
  await page.getByTestId('lesson-card-24').click();
  await expect(page.getByTestId('mission-title')).toContainText('24');
  await expect(page.getByTestId('mission-ctrl-w-note')).toBeVisible();
  await expect(page.getByTestId('mission-ctrl-w-note')).toContainText('Alt+W');

  await page.keyboard.press(':');
  await page.keyboard.type('vsp');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('split-pane-1')).toBeVisible();
  await expect(page.getByTestId('split-pane-0')).toHaveClass(/\bactive\b/);

  await page.keyboard.press('Alt+w');
  await page.keyboard.press('l');
  await expect(page.getByTestId('split-pane-1')).toHaveClass(/\bactive\b/);
  await expect(page.getByTestId('split-pane-0')).not.toHaveClass(/\bactive\b/);
});

test('자유 연습장 편집 내용은 자동 저장되어 새로고침 후 이어지고, 코드 초기화로 지워진다', async ({ page }) => {
  const errors = await openApp(page);
  const readAutosave = () => page.evaluate(() => localStorage.getItem('vim_sandbox_autosave_v1'));

  await page.getByTestId('tab-sandbox-btn').click();
  await expect(page.getByTestId('sandbox-panel')).toBeVisible();
  const firstLine = page.getByTestId('editor-row-1');
  const original = (await firstLine.textContent()) ?? '';
  expect(await readAutosave()).toBeNull();

  await page.keyboard.press('O');
  await page.keyboard.type('SAVED LINE');
  await page.keyboard.press('Escape');
  await expect(firstLine).toContainText('SAVED LINE');
  // 입력이 멈추고 0.8초 뒤에 저장됩니다.
  await expect.poll(readAutosave, { timeout: 5_000 }).not.toBeNull();

  await page.reload();
  await page.getByTestId('tab-sandbox-btn').click();
  await expect(page.getByTestId('sandbox-panel')).toBeVisible();
  await expect(page.getByTestId('editor-row-1')).toContainText('SAVED LINE');

  await page.getByTestId('sandbox-reset-btn').click();
  await expect(page.getByTestId('editor-row-1')).toHaveText(original);
  expect(await readAutosave()).toBeNull();
  expect(errors).toEqual([]);
});
