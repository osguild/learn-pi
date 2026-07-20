import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { Resource } from "../types";
import { ResourceLink } from "./ResourceLink";

const PAGE_SIZE = 5;

const columnHelper = createColumnHelper<Resource>();

interface Props {
  trackId: string;
  resources: Resource[];
}

export function ResourcesTable({ trackId, resources }: Props) {
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo(
    () => [
      columnHelper.accessor("title", {
        header: "Title",
        cell: ({ row }) => <ResourceLink trackId={trackId} resource={row.original} />,
      }),
      columnHelper.accessor("kind", {
        header: "Kind",
        cell: ({ getValue }) => {
          const kind = getValue();
          return kind ? <span className="res-kind-tag">{kind}</span> : <span className="dim">—</span>;
        },
      }),
      columnHelper.accessor("url", {
        header: "URL",
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
    data: resources,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase().trim();
      if (!q) return true;
      const r = row.original;
      return (
        r.title.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        (r.kind?.toLowerCase().includes(q) ?? false) ||
        (r.note?.toLowerCase().includes(q) ?? false)
      );
    },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  if (resources.length === 0) {
    return <div className="dim small res-empty">(no track-level resources yet)</div>;
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
            table.setPageIndex(0);
          }}
          aria-label="Search resources"
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
                  <th key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="res-no-match dim small">
                  No resources match your search.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
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
