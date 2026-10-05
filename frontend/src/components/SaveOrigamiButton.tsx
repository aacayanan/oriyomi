"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

interface SaveOrigamiButtonProps {
  text: string;
  sections: unknown[];
  voice: string | null;
  title?: string;
}

function deriveTitle(
  sections: unknown[],
  text: string,
  fallback?: string,
): string {
  if (fallback?.trim()) return fallback.trim();
  const first = (sections as { title?: string }[])[0];
  if (first?.title?.trim()) return first.title.trim();
  const trimmed = text.trim();
  if (trimmed.length > 40) return trimmed.slice(0, 40) + "…";
  return trimmed || "Untitled";
}

export default function SaveOrigamiButton({
  text,
  sections,
  voice,
  title,
}: SaveOrigamiButtonProps) {
  const { user, loading } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Don't render while auth is loading or user is not signed in.
  if (loading || !user) return null;
  // Nothing to save.
  if (!text.trim()) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/origamis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: deriveTitle(sections, text, title),
          text,
          sections,
          voice,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={saving || saved}
      className="outline-btn reader-transport-btn h-11 w-full rounded-none px-4 label-lg"
      title={error ?? undefined}
    >
      {saved ? "Saved for 24 hours" : saving ? "Saving…" : "Save folds"}
    </button>
  );
}
