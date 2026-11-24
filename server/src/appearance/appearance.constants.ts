// Allowed theme values. Keep in sync with client/src/lib/theme.ts.
export const THEME_MODES = ['light', 'dark', 'system'] as const;
export const THEME_PRESETS = ['slate', 'blue', 'green', 'violet', 'rose', 'orange'] as const;
export const THEME_FONTS = ['system', 'humanist', 'geometric', 'serif', 'rounded', 'mono'] as const;
export const THEME_FONT_SIZES = ['sm', 'md', 'lg'] as const;
export const THEME_RADII = [0, 0.25, 0.5, 0.75, 1] as const;
export const THEME_GLOWS = ['none', 'light', 'medium', 'full', 'too-much'] as const;

// AppSetting key that holds the organisation-wide default theme.
export const ORG_THEME_KEY = 'theme';
