import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { getApiErrorMessage } from '@/lib/api';
import { resolveTheme, type Theme } from '@/lib/theme';
import { ThemeEditor } from '@/components/appearance/ThemeEditor';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type Scope = 'mine' | 'org';

/**
 * Appearance settings, shown as a card on the Settings page. Everyone can set
 * their own look; people with "appearance.manage" also get the organisation
 * default.
 */
export function AppearanceSection() {
  const { user } = useAuth();
  const { org, mine } = useTheme();
  // The organisation default tab needs "appearance.manage".
  const isAdmin = !!user?.permissions?.includes('appearance.manage');
  const [tab, setTab] = useState<Scope>('mine');

  const mineInitial = useMemo(() => resolveTheme(org, mine), [org, mine]);
  const orgInitial = useMemo(() => resolveTheme(org), [org]);

  // Remount the panel when its saved starting point changes (e.g. after saving
  // or once settings load), so the draft always starts from the latest values.
  const minePanel = <ThemePanel key={`mine-${JSON.stringify(mineInitial)}`} scope="mine" initial={mineInitial} />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Appearance</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the colours, font, and layout style you like.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {isAdmin ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as Scope)}>
            <TabsList>
              <TabsTrigger value="mine">My appearance</TabsTrigger>
              <TabsTrigger value="org">Organisation default</TabsTrigger>
            </TabsList>
            <TabsContent value="mine">{minePanel}</TabsContent>
            <TabsContent value="org">
              <ThemePanel key={`org-${JSON.stringify(orgInitial)}`} scope="org" initial={orgInitial} />
            </TabsContent>
          </Tabs>
        ) : (
          minePanel
        )}
      </CardContent>
    </Card>
  );
}

function ThemePanel({ scope, initial }: { scope: Scope; initial: Theme }) {
  const { org, mine, setPreview, saveMine, clearMine, saveOrg, clearOrg } = useTheme();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Theme>(initial);
  const [busy, setBusy] = useState(false);

  // Live preview: the whole app shows the draft while this panel is open.
  useEffect(() => {
    setPreview(draft);
  }, [draft, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const hasSaved = scope === 'mine' ? mine !== null : org !== null;

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    try {
      await action();
      toast(message);
    } catch (err) {
      toast(getApiErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () => (scope === 'mine' ? saveMine(draft) : saveOrg(draft)),
      scope === 'mine' ? 'Your appearance was saved' : 'Organisation default saved',
    );

  const reset = () =>
    run(
      () => (scope === 'mine' ? clearMine() : clearOrg()),
      scope === 'mine' ? 'Now using the organisation default' : 'Organisation default reset',
    );

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <div>
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {scope === 'mine' ? 'My appearance' : 'Organisation default'}
            {scope === 'mine' && (
              <Badge variant={mine ? 'info' : 'secondary'}>
                {mine ? 'Personal settings' : 'Following organisation default'}
              </Badge>
            )}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope === 'mine'
              ? 'These settings apply only to you, on any device you sign in from.'
              : "Used by everyone who hasn't chosen their own settings, including the sign-in page. While you edit, the app shows your draft."}
          </p>
        </div>
        <ThemeEditor value={draft} onChange={setDraft} />
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={save} disabled={!dirty || busy}>
            {busy ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="outline" onClick={() => setDraft(initial)} disabled={!dirty || busy}>
            Discard changes
          </Button>
          <Button variant="ghost" onClick={reset} disabled={!hasSaved || busy} className="ml-auto">
            {scope === 'mine' ? 'Use organisation default' : 'Reset to built-in default'}
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-0 lg:self-start">
        <ThemePreview />
      </div>
    </div>
  );
}

/**
 * Sample components so the effect of a draft is easy to judge. This card keeps
 * its glow on purpose, so you can see what the Glow setting does to cards.
 */
function ThemePreview() {
  return (
    <Card aria-label="Theme preview">
      <CardHeader>
        <CardTitle className="text-base">Preview</CardTitle>
        <p className="text-sm text-muted-foreground">A sample of how the app will look.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="font-semibold">Acme ERP License</p>
          <p className="text-sm text-muted-foreground">
            Negotiation stage · <span className="text-primary underline">Alice Johnson</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge>Default</Badge>
          <Badge variant="success">Won</Badge>
          <Badge variant="warning">Due soon</Badge>
          <Badge variant="info">Qualified</Badge>
          <Badge variant="destructive">Lost</Badge>
        </div>
        <Input placeholder="Search people..." aria-label="Sample search field" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Primary</Button>
          <Button size="sm" variant="outline">Outline</Button>
          <Button size="sm" variant="secondary">Secondary</Button>
          <Button size="sm" variant="destructive">Delete</Button>
        </div>
      </CardContent>
    </Card>
  );
}
