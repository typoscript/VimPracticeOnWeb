import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DungeonRPG } from './DungeonRPG';
import { saveDungeonSave, getDefaultDungeonSave } from '../../utils/dungeonStorage';

describe('DungeonRPG Component', () => {
  const onPlayKeySound = vi.fn();
  const onPlaySuccessSound = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders initial Stage 1 HUD, skills, and tilemap correctly', () => {
    render(
      <DungeonRPG
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    expect(screen.getByTestId('dungeon-rpg-container')).toBeInTheDocument();
    expect(screen.getByTestId('dungeon-keystrokes')).toHaveTextContent('0 / 18');
    expect(screen.getByTestId('dungeon-key-status')).toHaveTextContent('❌ 없음');
    expect(screen.getByTestId('dungeon-door-status')).toHaveTextContent('🔒 잠김');
    expect(screen.getByTestId('dungeon-objective')).toHaveTextContent('바위(X)를 x로 부수고');

    // 기본 스킬 언락 상태 확인
    expect(screen.getByTestId('skill-slot-basic_move')).toHaveClass('unlocked');
    expect(screen.getByTestId('skill-slot-basic_slash')).toHaveClass('unlocked');
    expect(screen.getByTestId('skill-slot-word_boots')).toHaveClass('locked');
  });

  it('warns when pressing a disallowed key in stage 1', () => {
    render(
      <DungeonRPG
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    // Stage 1 does not allow 'w'
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    });

    expect(screen.getByTestId('dungeon-toast')).toHaveTextContent(
      '이 스테이지에서는 아직 [w] 키를 사용할 수 없습니다!'
    );
    // Disallowed key does not increase keystroke count
    expect(screen.getByTestId('dungeon-keystrokes')).toHaveTextContent('0 / 18');
  });

  it('blocks walking into walls (#) with h/j/k/l', () => {
    render(
      <DungeonRPG
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    // Initial position is (1, 1). Left is (1, 0) which is '#'
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    });

    expect(screen.getByTestId('dungeon-toast')).toHaveTextContent('벽에 부딪혔습니다!');
    expect(onPlayKeySound).toHaveBeenCalled();
  });

  it('allows breaking rock with x, picking up key, opening door, and reaching exit', () => {
    render(
      <DungeonRPG
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    // Initial cursor: line 1, col 1.
    // Line 1: '#@.X..#'
    // Move right to rock: col 1 -> 2 (l) -> 3 (l)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    });

    // Hit rock X with 'x'
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    });

    // Move to key K at (3, 1)
    // Move left twice: h, h -> col 1
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    });
    // Move down twice: j, j -> line 2, line 3 (col 1 is K)
    // Note: line 2 col 1 is '#'? Let's check map:
    // line 0: '#######'
    // line 1: '#@.X..#'
    // line 2: '###.#.#'
    // line 3: '#K..#.#'
    // Ah, line 2 col 1 is '#'. Line 2 col 3 is '.'!
    // So player must go through col 3:
    // From (1, 3): move down to (2, 3):
    // Let's restart stage to do a clean path or just use restart button.
    const restartBtn = screen.getByTestId('dungeon-restart-btn');
    fireEvent.click(restartBtn);

    // (1, 1) -> l -> (1, 2) -> l -> (1, 3) [rock X]
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    }); // rock destroyed!

    // Path to K (3, 1):
    // From (1, 3), down to (2, 3) (which is '.')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    // From (2, 3), down to (3, 3)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    // From (3, 3), left to (3, 2), then left to (3, 1) [K]
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    });

    // Key collected!
    expect(screen.getByTestId('dungeon-key-status')).toHaveTextContent('🗝️ 보유 중');
    expect(screen.getByTestId('dungeon-door-status')).toHaveTextContent('🔓 개방됨');

    // Now go to exit E at (5, 6):
    // From (3, 1), down to (4, 1)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    // From (4, 1), down to (5, 1)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    // Line 5: '#...D.E'
    // From (5, 1), walk right through door (5, 4) to exit (5, 6):
    // (5, 1) -> (5, 2) -> (5, 3) -> (5, 4 [D]) -> (5, 5) -> (5, 6 [E])
    for (let i = 0; i < 5; i++) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
      });
    }

    // Clear modal should be displayed!
    expect(screen.getByTestId('dungeon-clear-modal')).toBeInTheDocument();
    expect(screen.getByTestId('unlocked-skill-card')).toHaveTextContent(
      '바람의 도약 부츠 (w/b/e)'
    );

    // Clicking next stage button
    const nextBtn = screen.getByTestId('next-stage-btn');
    fireEvent.click(nextBtn);

    // Should now be on Stage 2
    expect(screen.getByTestId('dungeon-objective')).toHaveTextContent(
      'w/b/e 부츠'
    );
  });

  it('Stage 5 boss fight: defeating BUG_LORD unlocks exit and awards master badge', () => {
    // Unlock all stages first
    const save = getDefaultDungeonSave();
    save.highestUnlockedStage = 5;
    save.unlockedSkillIds = [
      'basic_move',
      'basic_slash',
      'word_boots',
      'find_hook',
      'bracket_portal',
      'alchemy_bridge',
      'wand_textobj',
    ];
    saveDungeonSave(save);

    render(
      <DungeonRPG
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    // Switch to Stage 5
    const dropdown = screen.getByTestId('stage-select-dropdown');
    fireEvent.change(dropdown, { target: { value: '4' } });

    expect(screen.getByTestId('dungeon-objective')).toHaveTextContent(
      '보스의 핵을 di"로 격파하고'
    );

    // Stage 5 initial cursor is at (1, 1).
    // Boss line is 2: '#..("BUG_LORD").#'
    // Move down to line 2:
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    // Move right into the boss quotes: (2, 1) -> (2, 2) -> (2, 3) -> (2, 4)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    });

    // Execute di" to destroy BUG_LORD
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '"' }));
    });

    // Boss destroyed! Door should now be open
    expect(screen.getByTestId('dungeon-door-status')).toHaveTextContent('🔓 개방됨');

    // Move to exit E at line 5, col 14:
    // Move down to line 5
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    // Move right to col 14
    for (let c = 0; c < 10; c++) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
      });
    }

    // Modal appears with master or conqueror badge!
    expect(screen.getByTestId('dungeon-clear-modal')).toBeInTheDocument();
    expect(screen.getByTestId('new-badge-banner')).toBeInTheDocument();
  });

  it('Stage 6 final boss fight: destroying CHAOS_DRAGON and reaching exit awards Grandmaster badge', () => {
    // Unlock all 6 stages
    const save = getDefaultDungeonSave();
    save.highestUnlockedStage = 6;
    save.unlockedSkillIds = [
      'basic_move',
      'basic_slash',
      'word_boots',
      'find_hook',
      'bracket_portal',
      'alchemy_bridge',
      'wand_textobj',
      'dragon_slayer',
    ];
    saveDungeonSave(save);

    render(
      <DungeonRPG
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    // Switch to Stage 6 (value '5')
    const dropdown = screen.getByTestId('stage-select-dropdown');
    fireEvent.change(dropdown, { target: { value: '5' } });

    expect(screen.getByTestId('dungeon-objective')).toHaveTextContent(
      '카오스 드래곤(CHAOS_DRAGON)을 격파하고'
    );

    // Move down to line 2: j
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });

    // Jump to quotes: f, "
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '"' }));
    });

    // Destroy dragon: d, i, "
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '"' }));
    });

    // Dragon defeated! Door should be opened
    expect(screen.getByTestId('dungeon-door-status')).toHaveTextContent('🔓 개방됨');

    // Move left to col 4 (safe ground): h, h, h
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    });

    // Move down: j, j to line 4
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });

    // Jump to Exit E: f, E
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'E' }));
    });

    // Modal appears with Grandmaster badge!
    expect(screen.getByTestId('dungeon-clear-modal')).toBeInTheDocument();
    expect(screen.getByTestId('unlocked-skill-card')).toHaveTextContent('Vim 그랜드마스터');
    expect(screen.getByTestId('new-badge-banner')).toHaveTextContent('Grandmaster of Vim');
  });
});
