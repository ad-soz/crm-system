import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportDialog } from './ImportDialog';
import { ToastProvider } from '@/context/ToastContext';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { post: vi.fn() } };
});

describe('ImportDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads a file and shows the import summary with errors', async () => {
    (api.post as any).mockResolvedValue({
      data: { total: 2, imported: 1, errors: [{ row: 3, message: 'firstName and lastName are required' }] },
    });

    renderWithProviders(
      <ToastProvider>
        <ImportDialog open onOpenChange={() => {}} onImported={() => {}} />
      </ToastProvider>,
    );

    const file = new File(['firstName,lastName\nA,B'], 'people.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await userEvent.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => expect(screen.getByText(/1 imported, 1 error/i)).toBeInTheDocument());
    expect(screen.getByText(/Row 3/i)).toBeInTheDocument();
  });
});
