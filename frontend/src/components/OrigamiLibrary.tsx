"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { msUntilExpiry, type Origami } from "@/types/origami";
import FoldCreaseArt from "./FoldCreaseArt";
import { CraneMark } from "./Icons";

/** Deterministic 0–999 from an id — drives the crease pattern per origami. */
function creaseSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 1000;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatChars(n: number): string {
  return n.toLocaleString("en-US");
}

/** "23h 59m" / "4h 12m" / "48m" — time until the origami expires. */
function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function OrigamiLibrary() {
  const router = useRouter();
  const [origamis, setOrigamis] = useState<Origami[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Ticks every 30s to refresh countdowns and drop expired entries. */
  const [now, setNow] = useState(() => Date.now());

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

  // Countdown ticker — also prunes locally once an origami expires.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setOrigamis((prev) => prev.filter((o) => msUntilExpiry(o, t) > 0));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

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

  function handleNew() {
    router.push("/app");
  }

  if (loading) {
    return (
      <div className="lib-shelf lib-shelf-loading" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="lib-folio lib-folio-skeleton">
            <div className="lib-folio-art lib-folio-art-skeleton" />
            <div className="lib-folio-body">
              <div className="lib-skeleton-line lib-skeleton-line-lg" />
              <div className="lib-skeleton-line" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="lib-error">
        <span className="lib-error-mark" aria-hidden="true">
          ×
        </span>
        <p className="lib-error-copy">{error}</p>
        <button
          type="button"
          onClick={fetchOrigamis}
          className="gold-dot-btn label-sm h-9 px-4"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="lib-shelf">
      {/* Create sheet — the cover of the shelf, primary entry into the reader */}
      <button type="button" className="lib-create" onClick={handleNew}>
        <div className="lib-create-art" aria-hidden="true">
          <svg viewBox="0 0 100 100" className="lib-create-crease">
            <g stroke="#F8F4EA" fill="none" strokeLinecap="square">
              <line x1="50" y1="-10" x2="50" y2="110" strokeWidth="1.2" opacity="0.55" />
              <line x1="-10" y1="50" x2="110" y2="50" strokeWidth="1.2" opacity="0.55" />
              <line x1="14" y1="14" x2="86" y2="86" strokeWidth="0.9" opacity="0.35" />
              <line x1="86" y1="14" x2="14" y2="86" strokeWidth="0.9" opacity="0.35" />
              <polygon points="50,14 86,50 50,86 14,50" strokeWidth="1.6" opacity="0.9" />
            </g>
          </svg>
          <CraneMark className="lib-create-crane" />
        </div>
        <div className="lib-create-body">
          <span className="lib-create-title">Create a new origami</span>
          <span className="lib-create-sub">Open the reader · fold a chapter</span>
        </div>
      </button>

      {/* Folios */}
      {origamis.map((o) => {
        const seed = creaseSeed(o.id);
        const remaining = msUntilExpiry(o, now);
        if (remaining <= 0) return null;
        return (
          <article key={o.id} className="lib-folio">
            <button
              type="button"
              className="lib-folio-hit"
              onClick={() => handleRead(o.id)}
              aria-label={`Open origami: ${o.title}`}
            >
              <div className="lib-folio-art">
                <FoldCreaseArt index={seed} className="h-full w-full" />
              </div>
              <div className="lib-folio-body">
                <h3 className="lib-folio-title">{o.title}</h3>
                <div className="lib-folio-rule" aria-hidden="true" />
                <div className="lib-folio-meta">
                  <span>{formatDate(o.created_at)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatChars(o.text.length)} chars</span>
                  <span aria-hidden="true">·</span>
                  <span>{o.speed}×</span>
                </div>
                <div className="lib-folio-expiry">
                  <span
                    className={`lib-folio-expiry-dot${remaining < 60 * 60 * 1000 ? " lib-folio-expiry-dot-warn" : ""}`}
                    aria-hidden="true"
                  />
                  Expires in {formatRemaining(remaining)}
                </div>
              </div>
            </button>
            <button
              type="button"
              className="lib-folio-delete"
              onClick={() => handleDelete(o.id)}
              disabled={deletingId === o.id}
              aria-label={`Delete origami: ${o.title}`}
            >
              {deletingId === o.id ? "…" : "×"}
            </button>
          </article>
        );
      })}
    </div>
  );
}
