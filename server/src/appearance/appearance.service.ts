import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ORG_THEME_KEY } from './appearance.constants';
import { ThemePrefsDto } from './dto/theme-prefs.dto';

export type ThemePrefs = Partial<Record<keyof ThemePrefsDto, unknown>>;

const ALLOWED_KEYS: (keyof ThemePrefsDto)[] = [
  'mode',
  'preset',
  'primary',
  'font',
  'fontSize',
  'radius',
  'glow',
];

/** Parse a stored JSON theme. Anything unreadable is treated as "not set". */
export function parseTheme(raw: string | null | undefined): ThemePrefs | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return pickKnown(value);
  } catch {
    return null;
  }
}

function pickKnown(input: Record<string, unknown>): ThemePrefs {
  const out: ThemePrefs = {};
  for (const key of ALLOWED_KEYS) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

@Injectable()
export class AppearanceService {
  constructor(private prisma: PrismaService) {}

  async getOrg(): Promise<ThemePrefs | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: ORG_THEME_KEY } });
    return parseTheme(row?.value);
  }

  async setOrg(prefs: ThemePrefsDto): Promise<ThemePrefs> {
    const clean = pickKnown({ ...prefs });
    const value = JSON.stringify(clean);
    await this.prisma.appSetting.upsert({
      where: { key: ORG_THEME_KEY },
      create: { key: ORG_THEME_KEY, value },
      update: { value },
    });
    return clean;
  }

  async clearOrg(): Promise<void> {
    await this.prisma.appSetting.deleteMany({ where: { key: ORG_THEME_KEY } });
  }

  async getMine(userId: string): Promise<ThemePrefs | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { themePrefs: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return parseTheme(user.themePrefs);
  }

  async setMine(userId: string, prefs: ThemePrefsDto): Promise<ThemePrefs> {
    const clean = pickKnown({ ...prefs });
    await this.prisma.user.update({
      where: { id: userId },
      data: { themePrefs: JSON.stringify(clean) },
    });
    return clean;
  }

  async clearMine(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { themePrefs: null } });
  }
}
