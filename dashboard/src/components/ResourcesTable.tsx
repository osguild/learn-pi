import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import type { ResourceKind } from "../types";
import { ResourceLink } from "./ResourceLink";
import { SortableTableHead, TableSortControl } from "./TableSortControl";
import type { TrackResourceRow } from "../utils/trackResources";
import { isUnitGuide } from "../utils/trackResources";

const PAGE_SIZE = 5;
const RESOURCE_KINDS: ResourceKind[] = ["article", "doc", "video", "book", "paper", "repo", "other"];
const SORT_OPTIONS = [
  { id: "title", label: "Title" },
  { id: "unitTitle", label: "Unit" },
  { id: "kind", label: "Kind" },
  { id: "url", label: "URL" },
  { id: "note", label: "Note" },
] as const;

type ScopeFilter = "all" | "track" | "unit" | "guides";

const columnHelper = createColumnHelper<TrackResourceRow>();

interface Props {
  trackId: string;
  resources: TrackResourceRow[];
}

export function ResourcesTable({ trackId, resources }: Props) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ResourceKind>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "title", desc: false }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });

  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (scopeFilter === "track" && r.unitId) return false;
      if (scopeFilter === "unit" && !r.unitId) return false;
      if (scopeFilter === "guides" && !isUnitGuide(r)) return false;
      return true;
    });
  }, [resources, kindFilter, scopeFilter]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("title", {
        header: "Title",
        cell: ({ row }) => (
          <span className={isUnitGuide(row.original) ? "res-unit-guide-title" : undefined}>
            <ResourceLink trackId={trackId} resource={row.original} />
          </span>
        ),
      }),
      columnHelper.accessor("unitTitle", {
        header: "Unit",
        sortingFn: (a, b) => {
          const au = a.original.unitTitle ?? "";
          const bu = b.original.unitTitle ?? "";
          if (!au && bu) return -1;
          if (au && !bu) return 1;
          return au.localeCompare(bu);
        },
        cell: ({ row }) => {
          const { unitTitle, unitId } = row.original;
          if (!unitTitle) return <span className="dim small">track</span>;
          return (
            <span className="res-unit-scope dim small" title={unitId ?? undefined}>
              {unitTitle}
            </span>
          );
        },
      }),
      columnHelper.accessor("kind", {
        header: "Kind",
        sortingFn: (a, b) => (a.original.kind ?? "").localeCompare(b.original.kind ?? ""),
        cell: ({ getValue }) => {
          const kind = getValue();
          return kind ? <span className="res-kind-tag">{kind}</span> : <span className="dim">—</span>;
        },
      }),
      columnHelper.accessor("url", {
        header: "URL",
        sortingFn: (a, b) => a.original.url.localeCompare(b.original.url),
        cell: ({ getValue }) => {
          const url = getValue();
          return (
            <span className="res-url mono" title={url}>
              {url}
            </span>
          );
        },
      }),
      columnHelper.accessor("note", {
        header: "Note",
        sortingFn: (a, b) => (a.original.note ?? "").localeCompare(b.original.note ?? ""),
        cell: ({ getValue }) => {
          const note = getValue();
          return note ? (
            <span className="res-note" title={note}>
              {note}
            </span>
          ) : (
            <span className="dim">—</span>
          );
        },
      }),
    ],
    [trackId],
  );

  const table = useReactTable({
    data: filteredResources,
    columns,
    state: { globalFilter, sorting, pagination },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Polling refreshes `resources` every 5s — don't reset page/sort on data updates.
    autoResetPageIndex: false,
    autoResetExpanded: false,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase().trim();
      if (!q) return true;
      const r = row.original;
      return (
        r.title.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        (r.kind?.toLowerCase().includes(q) ?? false) ||
        (r.note?.toLowerCase().includes(q) ?? false) ||
        (r.unitTitle?.toLowerCase().includes(q) ?? false) ||
        (r.unitId?.toLowerCase().includes(q) ?? false)
      );
    },
  });

  const resetPage = () => table.setPageIndex(0);

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  if (resources.length === 0) {
    return <div className="dim small res-empty">(no resources yet)</div>;
  }

  return (
    <div className="res-table-wrap">
      <div className="res-table-toolbar">
        <input
          type="search"
          className="res-search"
          placeholder="Search resources…"
          value={globalFilter}
          onChange={(e) => {
            setGlobalFilter(e.target.value);
            resetPage();
          }}
          aria-label="Search resources"
        />
        <select
          className="res-filter-select"
          value={kindFilter}
          onChange={(e) => {
            setKindFilter(e.target.value as "all" | ResourceKind);
            resetPage();
          }}
          aria-label="Filter by kind"
        >
          <option value="all">all kinds</option>
          {RESOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          className="res-filter-select"
          value={scopeFilter}
          onChange={(e) => {
            setScopeFilter(e.target.value as ScopeFilter);
            resetPage();
          }}
          aria-label="Filter by scope"
        >
          <option value="all">all scopes</option>
          <option value="track">track-level</option>
          <option value="unit">unit resources</option>
          <option value="guides">unit guides</option>
        </select>
        <TableSortControl
          sorting={sorting}
          options={[...SORT_OPTIONS]}
          onSortingChange={setSorting}
          onPageReset={resetPage}
        />
        <span className="dim small res-count">
          {filteredCount} of {resources.length}
        </span>
      </div>

      <div className="res-table-scroll">
        <table className="res-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <SortableTableHead
                    key={header.id}
                    canSort={header.column.getCanSort()}
                    sorted={header.column.getIsSorted()}
                    onToggle={header.column.getToggleSortingHandler()}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </SortableTableHead>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="res-no-match dim small">
                  No resources match your filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={`${row.original.unitId ?? "track"}-${row.original.id}`}
                  className={isUnitGuide(row.original) ? "res-row-guide" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="res-pagination">
          <button
            type="button"
            className="res-page-btn"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            ← prev
          </button>
          <span className="dim small res-page-info">
            page {pageIndex + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="res-page-btn"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            next →
          </button>
        </div>
      )}
    </div>
  );
}
