import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('Dungeon RPG Mode Integration with App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders tab button for Dungeon RPG and switches view when clicked', () => {
    render(<App />);

    const dungeonTabBtn = screen.getByTestId('tab-dungeon-btn');
    expect(dungeonTabBtn).toBeInTheDocument();
    expect(dungeonTabBtn).toHaveTextContent('🗡️ 던전 RPG');

    // Click Dungeon RPG tab
    fireEvent.click(dungeonTabBtn);

    // Verify Dungeon RPG is rendered
    expect(screen.getByTestId('dungeon-rpg-container')).toBeInTheDocument();
    expect(screen.getByTestId('dungeon-grid-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('dungeon-skills-bar')).toBeInTheDocument();
  });
});
