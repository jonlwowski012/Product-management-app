"use client";
import { useEffect, useState } from "react";
import { MAX_DISCOVERY_FILES } from "@/lib/discovery-limits";
import { request } from "./ui";

type SavedSource = { id: string; filename: string; role: string };
export function SavedMaterial({
  total,
  selected,
  disabled,
  onToggle,
}: {
  total: number;
  selected: { id: string; role: string }[];
  disabled: boolean;
  onToggle: (source: SavedSource) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{
    sources: SavedSource[];
    total: number;
    next: number | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      void request(`sources?q=${encodeURIComponent(search)}&offset=${offset}`)
        .then((result) => {
          if (active) setPage(result);
        })
        .catch((e) => {
          if (active) {
            setPage(null);
            setError(e.message);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, search, offset]);
  return (
    <details
      className="flow-optional"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Choose from saved material ({total.toLocaleString()})</summary>
      <p>
        Choose which saved documents to include. Removing one here keeps the
        original saved.
      </p>
      <label>
        Search saved material
        <input
          type="search"
          maxLength={200}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
      </label>
      {loading && <p role="status">Loading saved material…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && page && (
        <>
          {!page.sources.length && <p>No matching saved documents.</p>}
          {page.sources.map((source) => {
            const checked = selected.some((item) => item.id === source.id);
            return (
              <label className="flow-file" key={source.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    disabled ||
                    (!checked && selected.length >= MAX_DISCOVERY_FILES)
                  }
                  onChange={() => onToggle(source)}
                />
                <span>{source.filename}</span>
              </label>
            );
          })}
          {selected.length >= MAX_DISCOVERY_FILES && (
            <p>Each analysis can include up to 1,000 documents.</p>
          )}
          <div className="button-row">
            {offset > 0 && (
              <button
                type="button"
                className="button ghost"
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous saved documents
              </button>
            )}
            {page.next !== null && (
              <button
                type="button"
                className="button ghost"
                onClick={() => setOffset(page.next!)}
              >
                Next saved documents
              </button>
            )}
          </div>
        </>
      )}
    </details>
  );
}
