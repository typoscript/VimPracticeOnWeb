import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Keycaster } from './Keycaster';

describe('Keycaster Component', () => {
  it('renders placeholder when recentKeys is empty', () => {
    render(<Keycaster recentKeys={[]} />);
    expect(screen.getByText('RECENT KEYS')).toBeInTheDocument();
    expect(screen.getByText('키를 눌러보세요')).toBeInTheDocument();
  });

  it('renders keycaps with formatted labels and highlights latest key', () => {
    const keys = ['h', 'j', ' ', 'Escape'];
    render(<Keycaster recentKeys={keys} />);

    expect(screen.getByText('h')).toBeInTheDocument();
    expect(screen.getByText('j')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByText('Esc')).toBeInTheDocument();

    const latest = screen.getByTestId('keycap-3');
    expect(latest).toHaveClass('keycap-latest');
  });
});
