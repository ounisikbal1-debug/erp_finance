export interface StockSearchable {
  sku: string;
  name: string;
  barcode: string | null;
}

export function filterMaterialsByStockSearch<T extends StockSearchable>(
  materials: T[],
  searchTerm: string,
): T[] {
  const query = searchTerm.trim().toLocaleLowerCase();
  if (!query) return materials;
  return materials.filter((material) => [material.sku, material.name, material.barcode ?? '']
    .some((value) => value.toLocaleLowerCase().includes(query)));
}
