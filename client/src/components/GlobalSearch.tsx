import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { SearchResults, SearchResultItem } from '@/types';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

/**
 * Only text is drawn. If the server ever sent something else for a label (it once sent a whole
 * record for a deal's stage), React would refuse to draw it and blank the entire page, so
 * anything that is not text is simply left out.
 */
const text = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setFailed(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    // A slow answer to an earlier search must never replace the answer to a later one.
    let current = true;
    const handle = setTimeout(async () => {
      try {
        const res = await api.get<SearchResults>('/search', { params: { q: query } });
        if (!current) return;
        setResults(res.data);
        setFailed(false);
        setOpen(true);
      } catch {
        if (!current) return;
        setResults(null);
        setFailed(true);
        setOpen(true);
      } finally {
        if (current) setLoading(false);
      }
    }, 300);
    return () => {
      current = false;
      clearTimeout(handle);
    };
  }, [query]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const go = (item: SearchResultItem) => {
    setOpen(false);
    setQuery('');
    setResults(null);
    setFailed(false);
    const path =
      item.type === 'person' ? `/people/${item.id}` : item.type === 'company' ? `/companies/${item.id}` : `/deals/${item.id}`;
    navigate(path);
  };

  const people = results?.people ?? [];
  const companies = results?.companies ?? [];
  const deals = results?.deals ?? [];
  const total = people.length + companies.length + deals.length;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search people, companies, deals..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => (results || failed) && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          aria-label="Search"
          autoComplete="off"
          className="pl-8"
        />
      </div>
      {open && query.trim() && (
        <Card className="absolute z-50 mt-1 max-h-96 w-full overflow-y-auto shadow-lg">
          {loading && <div className="p-3 text-sm text-muted-foreground">Searching...</div>}
          {!loading && failed && (
            <div className="p-3 text-sm text-destructive" role="alert">
              Search is not available right now. Please try again.
            </div>
          )}
          {!loading && !failed && total === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No results found</div>
          )}
          {!loading && !failed && results && (
            <div className="py-1">
              <ResultGroup title="People" items={people} onSelect={go} />
              <ResultGroup title="Companies" items={companies} onSelect={go} />
              <ResultGroup title="Deals" items={deals} onSelect={go} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ResultGroup({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: SearchResultItem[];
  onSelect: (item: SearchResultItem) => void;
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <div className="px-3 py-1 text-xs font-semibold uppercase text-muted-foreground">{title}</div>
      {items.map((item) => (
        <button
          key={`${item.type}-${item.id}`}
          onClick={() => onSelect(item)}
          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
        >
          <span>{text(item.label)}</span>
          {text(item.sublabel) && <span className="text-xs text-muted-foreground">{text(item.sublabel)}</span>}
        </button>
      ))}
    </div>
  );
}
