import { describe, expect, it } from 'vitest';
import { paginateItems } from './dashboardPagination';

describe('dashboard pagination', () => {
  it('makes every catalog entry reachable exactly once', () => {
    const source = Array.from({ length: 86 }, (_, id) => id);
    const pages = Array.from({ length: paginateItems(source, 0, 6).pages }, (_, page) => paginateItems(source, page, 6).items);
    expect(pages.flat()).toEqual(source);
    expect(pages.at(-1)).toHaveLength(2);
  });
  it('clamps the page after search reduces the result count', () => {
    expect(paginateItems(['battery', 'solar'], 12, 6)).toEqual({ items: ['battery', 'solar'], page: 0, pages: 1, total: 2 });
  });
  it('keeps empty results on a valid page', () => {
    expect(paginateItems([], 10, 6)).toEqual({ items: [], page: 0, pages: 1, total: 0 });
  });
  it('normalizes unavailable page and size inputs', () => {
    expect(paginateItems([1, 2], NaN, 0).items).toEqual([1]);
    expect(paginateItems([1, 2], -3, Infinity).page).toBe(0);
  });
});
