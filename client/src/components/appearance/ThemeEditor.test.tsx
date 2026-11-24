import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeEditor } from './ThemeEditor';
import { DEFAULT_THEME, type Theme } from '@/lib/theme';

// Stateful wrapper so the editor behaves as it does on the real page.
function Harness({ onChange }: { onChange: (t: Theme) => void }) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  return (
    <ThemeEditor
      value={theme}
      onChange={(t) => {
        setTheme(t);
        onChange(t);
      }}
    />
  );
}

describe('ThemeEditor', () => {
  it('changes mode with the radio buttons', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /dark/i }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'dark' }));
  });

  it('selecting a preset clears any custom colour', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Hex code'), { target: { value: '#123456' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ primary: '#123456' }));

    await userEvent.click(screen.getByRole('radio', { name: /blue/i }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ preset: 'blue', primary: null }),
    );
  });

  it('ignores an incomplete hex code', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Hex code'), { target: { value: '#12' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Hex code')).toHaveAttribute('aria-invalid', 'true');
  });

  it('changes font, text size, and corners', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /serif/i }));
    await userEvent.click(screen.getByRole('radio', { name: /large/i }));
    await userEvent.click(screen.getByRole('radio', { name: /square/i }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ font: 'serif', fontSize: 'lg', radius: 0 }),
    );
  });

  it('offers Glow with five levels, starting at None, and changes it', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Glow' });
    const labels = Array.from(group.querySelectorAll('label')).map((l) => l.textContent?.trim());
    expect(labels).toEqual(['None', 'Light', 'Medium', 'Full', 'Too much']);
    expect(screen.getByRole('radio', { name: 'None', checked: true })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Too much' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ glow: 'too-much' }));
  });

  it('shows a readability warning for a low-contrast colour', () => {
    render(<Harness onChange={() => {}} />);
    expect(screen.queryByText(/readability check/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hex code'), { target: { value: '#fff3a0' } });
    expect(screen.getByText(/readability check/i)).toBeInTheDocument();
  });
});
