import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_THEME,
  GLOWS,
  PRESETS,
  THEME_CACHE_KEY,
  applyTheme,
  computeVars,
  contrastRatio,
  contrastWarnings,
  glowShadow,
  hexToHsl,
  hslToHex,
  hslToString,
  pickForeground,
  resolveTheme,
  type GlowId,
  type PresetId,
} from './theme';

describe('resolveTheme', () => {
  it('returns built-in defaults with no layers', () => {
    expect(resolveTheme()).toEqual(DEFAULT_THEME);
  });

  it('lets later layers override earlier ones field by field', () => {
    const theme = resolveTheme({ mode: 'dark', preset: 'blue' }, { preset: 'rose', font: 'serif' });
    expect(theme.mode).toBe('dark'); // from org
    expect(theme.preset).toBe('rose'); // user wins
    expect(theme.font).toBe('serif');
    expect(theme.fontSize).toBe('md'); // built-in default
  });

  it('lets a user clear an org custom colour back to the preset', () => {
    const theme = resolveTheme({ primary: '#ff0000' }, { primary: null });
    expect(theme.primary).toBeNull();
  });

  it('falls back to defaults for unknown values', () => {
    const theme = resolveTheme({ preset: 'neon' as PresetId, radius: 3, primary: 'red' });
    expect(theme.preset).toBe('slate');
    expect(theme.radius).toBe(0.5);
    expect(theme.primary).toBeNull();
  });

  it('defaults glow to none and ignores unknown glow values', () => {
    expect(resolveTheme().glow).toBe('none');
    expect(resolveTheme({ glow: 'full' }).glow).toBe('full');
    expect(resolveTheme({ glow: 'blinding' as GlowId }).glow).toBe('none');
    // Guards against inherited keys such as "toString" passing as a level.
    expect(resolveTheme({ glow: 'toString' as GlowId }).glow).toBe('none');
  });
});

describe('glow', () => {
  const accent = '221.2 83.2% 53.3%';

  it('offers the five levels in order', () => {
    expect(Object.keys(GLOWS)).toEqual(['none', 'light', 'medium', 'full', 'too-much']);
    expect(Object.values(GLOWS).map((g) => g.label)).toEqual(['None', 'Light', 'Medium', 'Full', 'Too much']);
  });

  it('draws no shadow for none', () => {
    expect(glowShadow('none', accent)).toBe('0 0 #0000');
  });

  it('tints the halo with the accent colour', () => {
    expect(glowShadow('light', accent)).toBe(`0 0 8px 0px hsl(${accent} / 0.2)`);
  });

  it('gets stronger at each step', () => {
    const strength = (id: GlowId) => GLOWS[id].layers.reduce((sum, [blur, spread, alpha]) => sum + (blur + spread) * alpha, 0);
    const order: GlowId[] = ['none', 'light', 'medium', 'full', 'too-much'];
    for (let i = 1; i < order.length; i++) {
      expect(strength(order[i])).toBeGreaterThan(strength(order[i - 1]));
    }
  });

  it('is applied as the --glow variable and follows a custom accent colour', () => {
    const theme = resolveTheme({ glow: 'medium', primary: '#2563eb' });
    expect(computeVars(theme, false)['--glow']).toContain('hsl(');
    expect(computeVars(resolveTheme({ glow: 'none' }), false)['--glow']).toBe('0 0 #0000');
  });
});

describe('colour maths', () => {
  it('converts hex to HSL and back', () => {
    expect(hslToString(hexToHsl('#ff0000'))).toBe('0 100% 50%');
    expect(hslToHex(hexToHsl('#2563eb'))).toBe('#2563eb');
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('0 0% 100%', '0 0% 0%')).toBeCloseTo(21, 0);
    expect(contrastRatio('0 0% 50%', '0 0% 50%')).toBeCloseTo(1, 5);
  });

  it('picks readable text for light and dark backgrounds', () => {
    expect(pickForeground('0 0% 5%')).toBe('210 40% 98%');
    expect(pickForeground('0 0% 95%')).toBe('222.2 47.4% 11.2%');
  });
});

describe('contrastWarnings', () => {
  it('passes for every built-in preset in light and dark mode', () => {
    for (const preset of Object.keys(PRESETS) as PresetId[]) {
      const warnings = contrastWarnings(resolveTheme({ preset, mode: 'system' }));
      expect({ preset, warnings }).toEqual({ preset, warnings: [] });
    }
  });

  it('warns for a low-contrast custom colour', () => {
    // Pale yellow is unreadable against a white page.
    const warnings = contrastWarnings(resolveTheme({ primary: '#fff3a0', mode: 'light' }));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].mode).toBe('light');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
    localStorage.clear();
  });

  it('sets CSS variables, dark class, font size, and caches the result', () => {
    const theme = resolveTheme({ mode: 'dark', preset: 'blue', fontSize: 'lg', radius: 1 });
    const dark = applyTheme(theme, false);
    const root = document.documentElement;

    expect(dark).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--primary')).toBe(PRESETS.blue.dark);
    expect(root.style.getPropertyValue('--radius')).toBe('1rem');
    expect(root.style.fontSize).toBe('18px');

    const cache = JSON.parse(localStorage.getItem(THEME_CACHE_KEY)!);
    expect(cache.dark).toBe(true);
    expect(cache.vars['--primary']).toBe(PRESETS.blue.dark);
  });

  it('follows the system setting in system mode', () => {
    const theme = resolveTheme({ mode: 'system' });
    expect(applyTheme(theme, true)).toBe(true);
    expect(applyTheme(theme, false)).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('uses a custom colour in both modes', () => {
    const theme = resolveTheme({ primary: '#2563eb' });
    expect(computeVars(theme, false)['--primary']).toBe(computeVars(theme, true)['--primary']);
  });
});
