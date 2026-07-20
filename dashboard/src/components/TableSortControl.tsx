import type { SortingState } from "@tanstack/react-table";
import type { MouseEventHandler, ReactNode } from "react";

export interface SortOption {
  id: string;
  label: string;
}

interface Props {
  sorting: SortingState;
  options: SortOption[];
  onSortingChange: (next: SortingState) => void;
  onPageReset?: () => void;
  label?: string;
}

export function TableSortControl({ sorting, options, onSortingChange, onPageReset, label = "Sort" }: Props) {
  const active = sorting[0] ?? { id: options[0]?.id ?? "", desc: false };
  const value = `${active.id}:${active.desc ? "desc" : "asc"}`;

  const apply = (id: string, desc: boolean) => {
    onSortingChange([{ id, desc }]);
    onPageReset?.();
  };

  return (
    <div className="table-sort-control">
      <label className="table-sort-label dim small" htmlFor={`sort-${options[0]?.id ?? "table"}`}>
        {label}
      </label>
      <select
        id={`sort-${options[0]?.id ?? "table"}`}
        className="res-filter-select table-sort-select"
        value={value}
        onChange={(e) => {
          const [id, dir] = e.target.value.split(":");
          apply(id, dir === "desc");
        }}
        aria-label={`${label} column`}
      >
        {options.flatMap((opt) => [
          <option key={`${opt.id}:asc`} value={`${opt.id}:asc`}>
            {opt.label} (A→Z)
          </option>,
          <option key={`${opt.id}:desc`} value={`${opt.id}:desc`}>
            {opt.label} (Z→A)
          </option>,
        ])}
      </select>
      <button
        type="button"
        className="table-sort-toggle"
        title="Toggle sort direction"
        aria-label="Toggle sort direction"
        onClick={() => apply(active.id, !active.desc)}
      >
        {active.desc ? "↓" : "↑"}
      </button>
    </div>
  );
}

export function SortableTableHead({
  canSort,
  sorted,
  onToggle,
  children,
}: {
  canSort: boolean;
  sorted: false | "asc" | "desc";
  onToggle?: MouseEventHandler<HTMLTableCellElement>;
  children: ReactNode;
}) {
  return (
    <th
      className={canSort ? `res-sortable${sorted ? " sorted" : ""}` : undefined}
      onClick={canSort ? onToggle : undefined}
      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : canSort ? "none" : undefined}
    >
      {children}
      {sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : canSort ? " ⇅" : null}
    </th>
  );
}
