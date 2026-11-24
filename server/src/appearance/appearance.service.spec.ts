import { NotFoundException } from '@nestjs/common';
import { AppearanceService, parseTheme } from './appearance.service';

describe('parseTheme', () => {
  it('returns null for empty or invalid JSON', () => {
    expect(parseTheme(null)).toBeNull();
    expect(parseTheme('')).toBeNull();
    expect(parseTheme('{not json')).toBeNull();
    expect(parseTheme('[1,2]')).toBeNull();
  });

  it('keeps only known keys', () => {
    expect(parseTheme('{"mode":"dark","evil":"x","radius":0.5}')).toEqual({
      mode: 'dark',
      radius: 0.5,
    });
  });

  it('keeps the glow setting', () => {
    expect(parseTheme('{"glow":"medium","evil":"x"}')).toEqual({ glow: 'medium' });
  });
});

describe('AppearanceService', () => {
  let prisma: any;
  let service: AppearanceService;

  beforeEach(() => {
    prisma = {
      appSetting: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    service = new AppearanceService(prisma);
  });

  it('returns null when no org theme is stored', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.getOrg()).toBeNull();
  });

  it('upserts the org theme as JSON', async () => {
    const result = await service.setOrg({ mode: 'dark', preset: 'blue' });
    expect(result).toEqual({ mode: 'dark', preset: 'blue' });
    const call = prisma.appSetting.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ key: 'theme' });
    expect(JSON.parse(call.create.value)).toEqual({ mode: 'dark', preset: 'blue' });
  });

  it('reads and writes a user override', async () => {
    prisma.user.findUnique.mockResolvedValue({ themePrefs: '{"font":"serif"}' });
    expect(await service.getMine('u1')).toEqual({ font: 'serif' });

    await service.setMine('u1', { fontSize: 'lg' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { themePrefs: '{"fontSize":"lg"}' },
    });
  });

  it('clears a user override', async () => {
    await service.clearMine('u1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { themePrefs: null },
    });
  });

  it('throws when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getMine('missing')).rejects.toThrow(NotFoundException);
  });
});
