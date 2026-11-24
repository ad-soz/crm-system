import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { getApiErrorMessage } from '@/lib/api';

export function TestDataSection() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const onSeedData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/setup/seed-data', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: `✓ Test data created: ${data.summary?.companies} companies, ${data.summary?.people} people, ${data.summary?.deals} deals, ${data.summary?.contacts} contacts, ${data.summary?.tasks} tasks`,
        });
      } else {
        setMessage({
          type: 'error',
          text: data.message || data.error || 'Could not seed data',
        });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: getApiErrorMessage(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Test Data</h2>
        <p className="text-sm text-muted-foreground">Populate the database with sample companies, people, deals, and tasks.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seed Test Data</CardTitle>
          <CardDescription>Create realistic sample data for testing and demo purposes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <Notice type={message.type === 'success' ? 'info' : 'error'}>
              {message.text}
            </Notice>
          )}
          <Button onClick={onSeedData} disabled={loading}>
            {loading ? 'Seeding...' : 'Create Sample Data'}
          </Button>
          <p className="text-xs text-muted-foreground">
            This will create 4 companies, 6 people, 5 deals in various stages, 5 contacts/activities, and 5 tasks. Safe to run multiple times—existing data won't be duplicated.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
