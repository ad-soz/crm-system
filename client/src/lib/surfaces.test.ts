import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Every bordered panel must be built from the shared Card (or Table / Notice /
 * Dialog, which are built on it). That is what makes appearance settings such
 * as Corners and Glow apply on every page. If this test fails, replace the
 * hand-written box with <Card>, <Card flat> (inside another card) or <Notice>.
 */

const SRC = join(__dirname, '..');

// Small form controls that merely look like a bordered chip are not panels.
const ALLOWED = [
  // Radio/checkbox "chips" in the appearance editor and the native colour input.
  'components/appearance/ThemeEditor.tsx',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [full] : [];
  });
}

// The primitives in components/ui are where the styling is allowed to live.
const files = sourceFiles(SRC).filter((f) => !relative(SRC, f).split(sep).join('/').startsWith('components/ui/'));

const hasBorder = (line: string) => /(^|[\s"'`])border([\s"'`]|$)/.test(line);
const hasRounding = (line: string) => /\brounded-(sm|md|lg|xl|2xl)\b/.test(line);

describe('surfaces', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('builds every bordered panel from the shared Card, not hand-written classes', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).split(sep).join('/');
      if (ALLOWED.includes(rel)) continue;
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (hasBorder(line) && hasRounding(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the allow-list honest', () => {
    for (const rel of ALLOWED) {
      const text = readFileSync(join(SRC, rel), 'utf8');
      expect(text.split(/\r?\n/).some((l) => hasBorder(l) && hasRounding(l))).toBe(true);
    }
  });
});
