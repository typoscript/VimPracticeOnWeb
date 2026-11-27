import { VimEditorState, handleKey } from '../vim-engine';
import { t } from '../i18n';

/**
 * 사용자 키 입력을 엔진에 넘길 때 쓰는 안전한 handleKey.
 *
 * 엔진 내부에서 예외가 나도 화면 전체가 멈추지 않도록, 직전 상태를 그대로 두고
 * 대기 중인 키만 비운 뒤 bell 과 안내 메시지를 띄웁니다. 개발 중에는 원인을 찾을 수
 * 있게 콘솔에 오류를 남깁니다.
 */
export function safeHandleKey(state: VimEditorState, key: string): VimEditorState {
  try {
    return handleKey(state, key);
  } catch (error) {
    console.error(`[vim-engine] handleKey failed for key ${JSON.stringify(key)}`, error);
    return {
      ...state,
      pendingKeys: undefined,
      bell: true,
      commandMessage: t('⚠️ 내부 오류로 키 {key} 를 처리하지 못했습니다. 편집 내용은 그대로입니다.', {
        key,
      }),
    };
  }
}
