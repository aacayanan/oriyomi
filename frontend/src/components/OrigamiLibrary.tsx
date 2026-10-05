"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Origami } from "@/types/origami";

function formatChars(n: number): string {
  return n.toLocaleString("en-US") + " chars";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function OrigamiLibrary() {
  const router = useRouter();
  const [origamis, setOrigamis] = useState<Origami[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchOrigamis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/origamis");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load (${res.status})`);
      }
      const data: Origami[] = await res.json();
      setOrigamis(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load origamis");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrigamis();
  }, [fetchOrigamis]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this origami? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/origamis/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error("Delete failed");
      }
      setOrigamis((prev) => prev.filter((o) => o.id !== id));
    } catch {
      setError("Failed to delete. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleRead(id: string) {
    router.push(`/app?origami=${id}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="label-ui label-lg text-ink-fade">
          Loading library…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <span className="label-ui label-lg text-vermilion">{error}</span>
        <button
          type="button"
          onClick={fetchOrigamis}
          className="outline-btn label-sm h-8 rounded-none px-3"
        >
          Retry
        </button>
      </div>
    );
  }

  if (origamis.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <span className="label-ui label-lg text-ink-fade">
          No origamis yet
        </span>
        <p className="font-body text-sm text-ink-mute">
          Save a fold session from the reader.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-0 divide-y divide-hairline">
      {origamis.map((o) => (
        <li
          key={o.id}
          className="group flex items-start justify-between gap-4 px-4 py-4 transition-colors hover:bg-fold"
        >
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold text-sumi truncate">
              {o.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-data label-sm text-ink-fade">
              <span>{formatDate(o.created_at)}</span>
              <span>{formatChars(o.text.length)}</span>
              <span>{o.speed}×</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => handleRead(o.id)}
              className="gold-dot-btn h-8 rounded-none px-3 label-sm"
            >
              Read
            </button>
            <button
              type="button"
              onClick={() => handleDelete(o.id)}
              disabled={deletingId === o.id}
              className="outline-btn h-8 rounded-none px-3 label-sm"
            >
              {deletingId === o.id ? "…" : "Delete"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}