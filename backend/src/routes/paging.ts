/**
 * 分頁共用(AGENT.md §7.1):清單 API 一律由後端篩選與分頁,前端不一次下載全部資料。
 * page 從 1 開始;pageSize 上限依 API 而定(預設 100)。回應 { items, total, page, pageSize }。
 */
export const pageProps = (maxPageSize = 100, defaultPageSize = 20) =>
  ({
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: maxPageSize, default: defaultPageSize },
  }) as const;

export function paginate<T>(rows: T[], page: number, pageSize: number) {
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}

/** 關鍵字比對(不分大小寫,任一欄位包含即符合) */
export function matchesQ(q: string | undefined, values: (string | null | undefined)[]): boolean {
  const k = q?.trim().toLowerCase();
  return !k || values.some((v) => v?.toLowerCase().includes(k));
}
