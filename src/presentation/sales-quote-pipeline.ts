export interface SalesQuotePipelineItem {
  id: string;
  status: 'DRAFT' | 'CONVERTED' | 'ORDERED';
}

export function groupSalesQuotesByPipelineStage<T extends SalesQuotePipelineItem>(quotes: readonly T[]) {
  return {
    draft: quotes.filter((quote) => quote.status === 'DRAFT'),
    converted: quotes.filter((quote) => quote.status === 'CONVERTED'),
    ordered: quotes.filter((quote) => quote.status === 'ORDERED'),
  };
}
