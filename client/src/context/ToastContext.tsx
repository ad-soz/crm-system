import React, { createContext, useContext, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { CheckCircle, XCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <Card
            key={t.id}
            className={cn(
              'flex min-w-[260px] items-center gap-2 px-4 py-3 text-sm shadow-lg',
              t.type === 'success' && 'border-success/40',
              t.type === 'error' && 'border-destructive/40',
              t.type === 'info' && 'border-info/40',
            )}
          >
            {t.type === 'success' && <CheckCircle className="h-4 w-4 text-success" />}
            {t.type === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
            {t.type === 'info' && <Info className="h-4 w-4 text-info" />}
            <span>{t.message}</span>
          </Card>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
