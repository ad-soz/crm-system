import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppearanceSection } from './AppearanceSection';

let permissions: string[] = [];
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', permissions } }),
}));

const setPreview = vi.fn();
vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    org: null,
    mine: null,
    setPreview,
    saveMine: vi.fn(),
    clearMine: vi.fn(),
    saveOrg: vi.fn(),
    clearOrg: vi.fn(),
  }),
}));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('AppearanceSection (Settings card)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = [];
  });

  it('is a titled card with the theme options, including Glow', () => {
    render(<AppearanceSection />);
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Glow' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Corners' })).toBeInTheDocument();
    expect(screen.getByLabelText('Theme preview')).toBeInTheDocument();
  });

  it('gives everyone their own appearance, without the organisation tab', () => {
    render(<AppearanceSection />);
    expect(screen.getByText('My appearance')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Organisation default' })).not.toBeInTheDocument();
  });

  it('adds the organisation default tab for people who can manage appearance', async () => {
    permissions = ['appearance.manage'];
    render(<AppearanceSection />);
    expect(screen.getByRole('button', { name: 'My appearance' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Organisation default' }));
    expect(screen.getByRole('group', { name: 'Glow' })).toBeInTheDocument();
  });
});
