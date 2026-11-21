import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupSalesQuotesByPipelineStage } from './sales-quote-pipeline';

describe('sales quote pipeline', () => {
  it('groups drafts, converted quotes and orders without changing their order or records', () => {
    const quotes = [
      { id: 'draft-1', status: 'DRAFT' as const, customer: 'Client A' },
      { id: 'converted-1', status: 'CONVERTED' as const, customer: 'Client B' },
      { id: 'draft-2', status: 'DRAFT' as const, customer: 'Client C' },
      { id: 'ordered-1', status: 'ORDERED' as const, customer: 'Client D' },
    ];

    const result = groupSalesQuotesByPipelineStage(quotes);

    assert.deepEqual(result.draft, [quotes[0], quotes[2]]);
    assert.deepEqual(result.converted, [quotes[1]]);
    assert.deepEqual(result.ordered, [quotes[3]]);
    assert.deepEqual(quotes.map(({ id }) => id), ['draft-1', 'converted-1', 'draft-2', 'ordered-1']);
  });

  it('returns empty stages when there are no quotes', () => {
    assert.deepEqual(groupSalesQuotesByPipelineStage([]), { draft: [], converted: [], ordered: [] });
  });
});
