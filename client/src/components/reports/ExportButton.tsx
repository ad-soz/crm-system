import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { csvFileName, downloadCsv, type CsvCell } from '@/lib/csv';

/**
 * Saves the figures a section is showing as a CSV file. Shown only to people
 * with the "Export CSV" permission. (The figures are already on their screen,
 * so this follows the role profile's intent; it is not a separate data door.)
 */
export function ExportButton({ name, rows }: { name: string; rows: () => CsvCell[][] }) {
  const { can } = usePermissions();
  if (!can('data.export')) return null;
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv(csvFileName(name), rows())}>
      <Download className="h-4 w-4" aria-hidden /> Export CSV
    </Button>
  );
}
