// Theme engine: resolves layered theme preferences (built-in < organisation <
// user) and applies them as CSS variables on <html>. Every colour in the UI is
// driven by these variables, so changing them re-themes the whole app.
//
// Allowed values must stay in sync with server/src/appearance/appearance.constants.ts.

export type ThemeMode = 'light' | 'dark' | 'system';
export type PresetId = 'slate' | 'blue' | 'green' | 'violet' | 'rose' | 'orange';
export type FontId = 'system' | 'humanist' | 'geometric' | 'serif' | 'rounded' | 'mono';
export type FontSizeId = 'sm' | 'md' | 'lg';
export type GlowId = 'none' | 'light' | 'medium' | 'full' | 'too-much';

export interface Theme {
  mode: ThemeMode;
  preset: PresetId;
  /** Custom accent colour (#rrggbb). null = use the preset colour. */
  primary: string | null;
  font: FontId;
  fontSize: FontSizeId;
  radius: number;
  glow: GlowId;
}

export type ThemePrefs = Partial<Theme>;

export const DEFAULT_THEME: Theme = {
  mode: 'light',
  preset: 'slate',
  primary: null,
  font: 'system',
  fontSize: 'md',
  radius: 0.5,
  glow: 'none',
};

// Accent colours per preset, as "H S% L%" for light and dark mode. Values are
// chosen so each preset passes the contrast checks below in both modes.
export const PRESETS: Record<PresetId, { label: string; light: string; dark: string }> = {
  slate: { label: 'Slate', light: '222.2 47.4% 11.2%', dark: '210 40% 98%' },
  blue: { label: 'Blue', light: '221.2 83.2% 53.3%', dark: '217.2 91.2% 59.8%' },
  green: { label: 'Green', light: '142.1 76.2% 36.3%', dark: '142.1 70.6% 45.3%' },
  violet: { label: 'Violet', light: '262.1 83.3% 57.8%', dark: '263.4 70% 65%' },
  rose: { label: 'Rose', light: '346.8 77.2% 45%', dark: '346.8 77.2% 59.8%' },
  orange: { label: 'Orange', light: '21 90% 40%', dark: '20.5 90.2% 55%' },
};

// System font stacks only: no web fonts are downloaded, which keeps the app
// lightweight and works offline. The exact face shown depends on the OS.
export const FONTS: Record<FontId, { label: string; stack: string }> = {
  system: {
    label: 'System',
    stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  humanist: {
    label: 'Humanist',
    stack: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
  },
  geometric: {
    label: 'Geometric',
    stack: 'Avenir, Montserrat, Corbel, "URW Gothic", source-sans-pro, sans-serif',
  },
  serif: {
    label: 'Serif',
    stack: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
  },
  rounded: {
    label: 'Rounded',
    stack: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", Calibri, source-sans-pro, sans-serif',
  },
  mono: {
    label: 'Monospace',
    stack: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace',
  },
};

// Root font size. Everything is sized in rem, so this scales the whole UI.
export const FONT_SIZES: Record<FontSizeId, { label: string; px: number }> = {
  sm: { label: 'Small', px: 14 },
  md: { label: 'Medium', px: 16 },
  lg: { label: 'Large', px: 18 },
};

export const RADII: { value: number; label: string }[] = [
  { value: 0, label: 'Square' },
  { value: 0.25, label: 'Subtle' },
  { value: 0.5, label: 'Default' },
  { value: 0.75, label: 'Round' },
  { value: 1, label: 'Extra round' },
];

// A soft halo in the accent colour around cards and primary buttons. Each layer
// is [blur px, spread px, opacity]. Keep ids in sync with the server constants.
export const GLOWS: Record<GlowId, { label: string; layers: [number, number, number][] }> = {
  none: { label: 'None', layers: [] },
  light: { label: 'Light', layers: [[8, 0, 0.2]] },
  medium: { label: 'Medium', layers: [[16, 1, 0.35]] },
  full: { label: 'Full', layers: [[24, 3, 0.5]] },
  'too-much': {
    label: 'Too much',
    layers: [
      [20, 4, 0.8],
      [48, 12, 0.6],
    ],
  },
};

/** The CSS box-shadow for a glow level, tinted with an "H S% L%" accent colour. */
export function glowShadow(id: GlowId, primary: string): string {
  const layers = GLOWS[id].layers;
  if (layers.length === 0) return '0 0 #0000';
  return layers
    .map(([blur, spread, alpha]) => `0 0 ${blur}px ${spread}px hsl(${primary} / ${alpha})`)
    .join(', ');
}

const FG_LIGHT = '210 40% 98%';
const FG_DARK = '222.2 47.4% 11.2%';

const LIGHT_BASE: Record<string, string> = {
  '--background': '0 0% 100%',
  '--foreground': '222.2 84% 4.9%',
  '--card': '0 0% 100%',
  '--card-foreground': '222.2 84% 4.9%',
  '--secondary': '210 40% 96.1%',
  '--secondary-foreground': '222.2 47.4% 11.2%',
  '--muted': '210 40% 96.1%',
  '--muted-foreground': '215.4 16.3% 46.9%',
  '--accent': '210 40% 96.1%',
  '--accent-foreground': '222.2 47.4% 11.2%',
  '--destructive': '0 72% 51%',
  '--destructive-foreground': '210 40% 98%',
  '--border': '214.3 31.8% 91.4%',
  '--input': '214.3 31.8% 91.4%',
  '--success': '142 72% 29%',
  '--success-foreground': '0 0% 100%',
  '--warning': '28 92% 36%',
  '--warning-foreground': '0 0% 100%',
  '--info': '221 83% 45%',
  '--info-foreground': '0 0% 100%',
};

const DARK_BASE: Record<string, string> = {
  '--background': '222.2 84% 4.9%',
  '--foreground': '210 40% 98%',
  '--card': '222.2 60% 7%',
  '--card-foreground': '210 40% 98%',
  '--secondary': '217.2 32.6% 17.5%',
  '--secondary-foreground': '210 40% 98%',
  '--muted': '217.2 32.6% 17.5%',
  '--muted-foreground': '215 20.2% 65.1%',
  '--accent': '217.2 32.6% 17.5%',
  '--accent-foreground': '210 40% 98%',
  '--destructive': '0 72% 60%',
  '--destructive-foreground': '222.2 47.4% 11.2%',
  '--border': '217.2 32.6% 22%',
  '--input': '217.2 32.6% 22%',
  '--success': '142 69% 58%',
  '--success-foreground': '222.2 47.4% 11.2%',
  '--warning': '38 92% 60%',
  '--warning-foreground': '222.2 47.4% 11.2%',
  '--info': '213 94% 68%',
  '--info-foreground': '222.2 47.4% 11.2%',
};

export const THEME_CACHE_KEY = 'crm_theme_cache';

// ---- Resolution ----

/** Merge preference layers field by field. Later layers win. */
export function resolveTheme(...layers: (ThemePrefs | null | undefined)[]): Theme {
  const out: Theme = { ...DEFAULT_THEME };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) (out as unknown as Record<string, unknown>)[key] = value;
    }
  }
  // Fall back to defaults for anything unknown (e.g. a value from an older version).
  if (!['light', 'dark', 'system'].includes(out.mode)) out.mode = DEFAULT_THEME.mode;
  if (!(out.preset in PRESETS)) out.preset = DEFAULT_THEME.preset;
  if (!(out.font in FONTS)) out.font = DEFAULT_THEME.font;
  if (!(out.fontSize in FONT_SIZES)) out.fontSize = DEFAULT_THEME.fontSize;
  if (!RADII.some((r) => r.value === out.radius)) out.radius = DEFAULT_THEME.radius;
  if (!Object.prototype.hasOwnProperty.call(GLOWS, out.glow)) out.glow = DEFAULT_THEME.glow;
  if (out.primary !== null && !isHexColor(out.primary)) out.primary = null;
  return out;
}

export function isDarkMode(theme: Theme, systemDark: boolean): boolean {
  return theme.mode === 'dark' || (theme.mode === 'system' && systemDark);
}

export function primaryFor(theme: Theme, dark: boolean): string {
  if (theme.primary) return hslToString(hexToHsl(theme.primary));
  return PRESETS[theme.preset][dark ? 'dark' : 'light'];
}

/** All CSS custom properties for a theme in the given mode. */
export function computeVars(theme: Theme, dark: boolean): Record<string, string> {
  const primary = primaryFor(theme, dark);
  return {
    ...(dark ? DARK_BASE : LIGHT_BASE),
    '--primary': primary,
    '--primary-foreground': pickForeground(primary),
    '--ring': primary,
    '--radius': `${theme.radius}rem`,
    '--glow': glowShadow(theme.glow, primary),
    '--font-sans': FONTS[theme.font].stack,
  };
}

/**
 * Apply a theme to the document and cache the result so the next page load
 * can paint with the right colours before the app boots (see index.html).
 */
export function applyTheme(
  theme: Theme,
  systemDark: boolean,
  root: HTMLElement = document.documentElement,
): boolean {
  const dark = isDarkMode(theme, systemDark);
  const vars = computeVars(theme, dark);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  const fontSize = `${FONT_SIZES[theme.fontSize].px}px`;
  root.style.fontSize = fontSize;
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ vars, dark, fontSize }));
  } catch {
    // Storage can be unavailable (private mode); the theme still applies.
  }
  return dark;
}

// ---- Colour maths ----

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: round1(h), s: round1(s * 100), l: round1(l * 100) };
}

export function hslToString({ h, s, l }: Hsl): string {
  return `${h} ${s}% ${l}%`;
}

export function parseHsl(value: string): Hsl {
  const [h, s, l] = value.replace(/%/g, '').trim().split(/\s+/).map(Number);
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function hslToHex(hsl: Hsl): string {
  return `#${hslToRgb(hsl)
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two "H S% L%" colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hslToRgb(parseHsl(a)));
  const lb = relativeLuminance(hslToRgb(parseHsl(b)));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Choose light or dark text, whichever reads better on the given colour. */
export function pickForeground(background: string): string {
  return contrastRatio(background, FG_LIGHT) >= contrastRatio(background, FG_DARK)
    ? FG_LIGHT
    : FG_DARK;
}

// ---- Accessibility checks ----

export interface ContrastWarning {
  mode: 'light' | 'dark';
  message: string;
}

/**
 * Flags accent colours that would be hard to read. Checks every mode the theme
 * can display (both, for "system"). Thresholds follow WCAG 2.1: 4.5:1 for text
 * on buttons, 3:1 for the accent against the page background.
 */
export function contrastWarnings(theme: Theme): ContrastWarning[] {
  const modes: boolean[] = theme.mode === 'system' ? [false, true] : [theme.mode === 'dark'];
  const warnings: ContrastWarning[] = [];
  for (const dark of modes) {
    const mode = dark ? 'dark' : 'light';
    const primary = primaryFor(theme, dark);
    const background = (dark ? DARK_BASE : LIGHT_BASE)['--background'];
    const buttonText = contrastRatio(primary, pickForeground(primary));
    if (buttonText < 4.5) {
      warnings.push({
        mode,
        message: `Button text is hard to read in ${mode} mode (${buttonText.toFixed(1)}:1, aim for 4.5:1 or more).`,
      });
    }
    const accent = contrastRatio(primary, background);
    if (accent < 3) {
      warnings.push({
        mode,
        message: `The accent colour is hard to see against the ${mode} background (${accent.toFixed(1)}:1, aim for 3:1 or more).`,
      });
    }
  }
  return warnings;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
