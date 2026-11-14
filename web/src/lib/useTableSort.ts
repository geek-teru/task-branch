import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir } | null;

// A column's sort value. null (empty description, no date) always goes last.
// Arrays compare element by element (a period: start date, then due date).
export type SortValue = string | number | null | (string | number | null)[];

// Click a column header: ascending → descending → off (the rows' own order).
// One column at a time; not remembered across visits.
export function useTableSort<T, K extends string>(rows: T[], columns: Record<K, (row: T) => SortValue>) {
  const [sort, setSort] = useState<SortState<K>>(null);

  const toggle = (key: K) =>
    setSort((cur) => (cur?.key !== key ? { key, dir: "asc" } : cur.dir === "asc" ? { key, dir: "desc" } : null));

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const value = columns[sort.key];
    const sign = sort.dir === "asc" ? 1 : -1;
    // Array.prototype.sort is stable, so equal rows keep their order.
    return [...rows].sort((a, b) => compareValues(value(a), value(b), sign));
    // columns is a module-level constant in every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  // setSort picks a column and direction directly (the phone's sort Select, which has no headers).
  return { sorted, sort, toggle, setSort };
}

function compareValues(a: SortValue, b: SortValue, sign: number): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const c = compareValues(a[i] ?? null, b[i] ?? null, sign);
      if (c !== 0) return c;
    }
    return 0;
  }
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1; // empty last in both directions
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return String(a).localeCompare(String(b), "ja") * sign;
}
