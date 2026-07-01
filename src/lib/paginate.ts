import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PostgREST caps a single `select` at `max-rows` (default 1000) and returns the
 * truncated set with no error. For the alert-fan-out crons that read every
 * subscriber, that silent cap means everyone past row 1000 stops getting alerts
 * once the base grows — the worst failure mode for an early-warning product.
 *
 * `fetchAllRows` pages past that cap with `.range()`. Callers MUST supply a
 * stable order inside `refine` (e.g. `.order("chat_id")`) so pages don't overlap
 * or skip rows between requests.
 */
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refine?: (q: any) => any
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (refine) q = refine(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}
