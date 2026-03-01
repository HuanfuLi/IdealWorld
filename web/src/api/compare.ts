import type { ComparisonResult } from '@idealworld/shared';

export const compareApi = {
  async runComparison(id1: string, id2: string): Promise<ComparisonResult> {
    const res = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id1, id2 }),
    });
    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(err.error || 'Comparison failed');
    }
    const data = await res.json() as { comparison: ComparisonResult };
    return data.comparison;
  },

  async sendMessage(id1: string, id2: string, message: string): Promise<string> {
    const res = await fetch('/api/compare/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id1, id2, message }),
    });
    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(err.error || 'Chat failed');
    }
    const data = await res.json() as { reply: string };
    return data.reply;
  },
};
