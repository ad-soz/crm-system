import { IsIn, IsOptional, Matches } from 'class-validator';
import {
  THEME_FONTS,
  THEME_FONT_SIZES,
  THEME_GLOWS,
  THEME_MODES,
  THEME_PRESETS,
  THEME_RADII,
} from '../appearance.constants';

// Every field is optional: a stored theme only overrides what it sets, and the
// client fills the rest from the next layer down (org default, then built-in).
export class ThemePrefsDto {
  @IsOptional()
  @IsIn(THEME_MODES)
  mode?: string;

  @IsOptional()
  @IsIn(THEME_PRESETS)
  preset?: string;

  // Custom accent colour as #rrggbb. null means "use the preset colour".
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'primary must be a hex colour like #2563eb' })
  primary?: string | null;

  @IsOptional()
  @IsIn(THEME_FONTS)
  font?: string;

  @IsOptional()
  @IsIn(THEME_FONT_SIZES)
  fontSize?: string;

  @IsOptional()
  @IsIn(THEME_RADII as unknown as number[])
  radius?: number;

  @IsOptional()
  @IsIn(THEME_GLOWS)
  glow?: string;
}
