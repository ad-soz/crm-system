import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api';
import type { SchemaOp, PreviewResult, ApplyResult } from '@/types';

type Phase = 'idle' | 'previewing' | 'preview-ready' | 'applying' | 'done' | 'error';

export function useSchemaEdit() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setPreview(null);
    setError(null);
    setResult(null);
  }, []);

  const runPreview = useCallback(async (ops: SchemaOp[]) => {
    setPhase('previewing');
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const res = await api.post<PreviewResult>('/schema/preview', { ops });
      setPreview(res.data);
      setPhase('preview-ready');
    } catch (err) {
      setError(getApiErrorMessage(err));
      setPhase('error');
    }
  }, []);

  const apply = useCallback(
    async (ops: SchemaOp[], migrationName: string) => {
      setPhase('applying');
      setError(null);
      try {
        const res = await api.post<ApplyResult>('/schema/apply', { ops, migrationName });
        if (res.data.success) {
          setResult(res.data);
          setPhase('done');
          // The schema changed; refresh the ERD and any entity data.
          qc.invalidateQueries({ queryKey: ['erd'] });
        } else {
          setError(res.data.error ?? 'Migration failed');
          setPhase('error');
        }
      } catch (err) {
        setError(getApiErrorMessage(err));
        setPhase('error');
      }
    },
    [qc],
  );

  return { phase, preview, error, result, runPreview, apply, reset };
}
