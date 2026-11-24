import { useEffect, useState } from 'react';
import { AlertTriangle, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FONTS,
  FONT_SIZES,
  GLOWS,
  PRESETS,
  RADII,
  contrastWarnings,
  glowShadow,
  hslToHex,
  isHexColor,
  parseHsl,
  primaryFor,
  type FontId,
  type FontSizeId,
  type GlowId,
  type PresetId,
  type Theme,
  type ThemeMode,
} from '@/lib/theme';
import { Notice } from '@/components/ui/notice';

interface Option<T extends string | number> {
  value: T;
  label: string;
  content?: React.ReactNode;
}

/**
 * A group of visually styled native radio buttons. Native inputs give arrow-key
 * navigation and screen reader support without extra ARIA wiring.
 */
function OptionGroup<T extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
  className,
}: {
  legend: string;
  name: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {options.map((opt) => (
          <label key={String(opt.value)} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={String(opt.value)}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex h-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                'hover:bg-accent peer-checked:border-primary peer-checked:ring-1 peer-checked:ring-primary',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
              )}
            >
              {opt.content ?? opt.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ThemeEditor({ value, onChange }: { value: Theme; onChange: (theme: Theme) => void }) {
  const set = <K extends keyof Theme>(key: K, v: Theme[K]) => onChange({ ...value, [key]: v });

  // The colour picker always shows the colour currently in use.
  const currentHex = value.primary ?? hslToHex(parseHsl(primaryFor(value, false)));
  const [hexText, setHexText] = useState(currentHex);
  useEffect(() => setHexText(currentHex), [currentHex]);

  const warnings = contrastWarnings(value);

  return (
    <div className="space-y-6">
      <OptionGroup<ThemeMode>
        legend="Mode"
        name="theme-mode"
        value={value.mode}
        onChange={(v) => set('mode', v)}
        options={[
          { value: 'light', label: 'Light', content: <><Sun className="h-4 w-4" aria-hidden /> Light</> },
          { value: 'dark', label: 'Dark', content: <><Moon className="h-4 w-4" aria-hidden /> Dark</> },
          { value: 'system', label: 'System', content: <><Monitor className="h-4 w-4" aria-hidden /> Match my device</> },
        ]}
      />

      <div className="space-y-3">
        <OptionGroup<PresetId>
          legend="Accent colour"
          name="theme-preset"
          value={value.primary ? null : value.preset}
          onChange={(v) => onChange({ ...value, preset: v, primary: null })}
          options={(Object.keys(PRESETS) as PresetId[]).map((id) => ({
            value: id,
            label: PRESETS[id].label,
            content: (
              <>
                <span
                  aria-hidden
                  className="h-4 w-4 rounded-full border"
                  style={{ background: `hsl(${PRESETS[id].light})` }}
                />
                {PRESETS[id].label}
              </>
            ),
          }))}
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="theme-custom-colour">Custom colour</Label>
            <input
              id="theme-custom-colour"
              type="color"
              value={currentHex}
              onChange={(e) => set('primary', e.target.value)}
              className="h-9 w-14 cursor-pointer rounded-md border bg-transparent p-1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="theme-custom-hex">Hex code</Label>
            <Input
              id="theme-custom-hex"
              value={hexText}
              maxLength={7}
              className="w-28 font-mono"
              aria-invalid={!isHexColor(hexText)}
              aria-describedby="theme-custom-hex-help"
              onChange={(e) => {
                const text = e.target.value.trim();
                setHexText(text);
                if (isHexColor(text)) set('primary', text.toLowerCase());
              }}
            />
          </div>
          <p id="theme-custom-hex-help" className="pb-2 text-xs text-muted-foreground">
            {value.primary ? 'Using a custom colour.' : 'Pick any colour, or enter a code like #2563eb.'}
          </p>
        </div>
      </div>

      <OptionGroup<FontId>
        legend="Font"
        name="theme-font"
        value={value.font}
        onChange={(v) => set('font', v)}
        className="grid grid-cols-2 sm:grid-cols-3"
        options={(Object.keys(FONTS) as FontId[]).map((id) => ({
          value: id,
          label: FONTS[id].label,
          content: (
            <span className="flex flex-col items-start" style={{ fontFamily: FONTS[id].stack }}>
              <span className="font-medium">{FONTS[id].label}</span>
              <span className="text-xs text-muted-foreground">The quick brown fox</span>
            </span>
          ),
        }))}
      />

      <OptionGroup<FontSizeId>
        legend="Text size"
        name="theme-font-size"
        value={value.fontSize}
        onChange={(v) => set('fontSize', v)}
        options={(Object.keys(FONT_SIZES) as FontSizeId[]).map((id) => ({
          value: id,
          label: FONT_SIZES[id].label,
        }))}
      />

      <OptionGroup<number>
        legend="Corners"
        name="theme-radius"
        value={value.radius}
        onChange={(v) => set('radius', v)}
        options={RADII.map((r) => ({
          value: r.value,
          label: r.label,
          content: (
            <>
              <span
                aria-hidden
                className="h-4 w-4 border-2 border-foreground/60"
                style={{ borderRadius: `${r.value * 0.5}rem` }}
              />
              {r.label}
            </>
          ),
        }))}
      />

      <OptionGroup<GlowId>
        legend="Glow"
        name="theme-glow"
        value={value.glow}
        onChange={(v) => set('glow', v)}
        options={(Object.keys(GLOWS) as GlowId[]).map((id) => ({
          value: id,
          label: GLOWS[id].label,
          content: (
            <>
              <span
                aria-hidden
                className="mr-1 h-4 w-4 rounded-sm bg-primary"
                style={{ boxShadow: glowShadow(id, primaryFor(value, false)) }}
              />
              {GLOWS[id].label}
            </>
          ),
        }))}
      />

      <div aria-live="polite">
        {warnings.length > 0 && (
          <Notice tone="warning" className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Readability check
            </p>
            <ul className="list-disc space-y-0.5 pl-6 text-xs">
              {warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
            <p className="text-xs">You can still save, but some people may find it hard to read.</p>
          </Notice>
        )}
      </div>
    </div>
  );
}
