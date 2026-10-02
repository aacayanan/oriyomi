"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface BrainrotClip {
  /** YouTube video id (watch?v=…) — swap these for the clips you want */
  youtubeId: string;
  label: string;
}

/**
 * Replace IDs with the real YouTube links you want in the carousel.
 * Local MP4s can be dropped in later via `src` if you license the clips.
 */
export const BRAINROT_CLIPS: BrainrotClip[] = [
  { youtubeId: "eRXE8Aebp7s", label: "Subway Surfers" },
  { youtubeId: "zeyy5Yj-A4I", label: "Minecraft Parkour" },
  { youtubeId: "ohFdCMXURWc", label: "Kinetic Sand" },
  { youtubeId: "TFFDhOAq_ck", label: "Hydraulic Press" },
];

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      // API script already present — wait for callback
      return;
    }
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

function embedUrl(id: string) {
  // Muted autoplay loop; playlist= same id is required for loop on iframes
  return (
    `https://www.youtube-nocookie.com/embed/${id}` +
    `?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}` +
    `&playsinline=1&modestbranding=1&rel=0`
  );
}

interface BrainrotStageProps {
  className?: string;
}

/**
 * Top-right stage: crease sheet by default; hover reveals invisible
 * arrows; sliding switches to muted looping "brainrot" videos.
 * Audio is forced off via mute=1 + player.mute() on ready.
 */
export default function BrainrotStage({ className = "" }: BrainrotStageProps) {
  const [hovered, setHovered] = useState(false);
  const [clipIndex, setClipIndex] = useState<number | null>(null);
  const playerRef = useRef<any>(null);
  const hostIdRef = useRef<string>(
    `brainrot-host-${Math.random().toString(36).slice(2, 9)}`,
  );

  const total = BRAINROT_CLIPS.length;
  const active = clipIndex !== null ? BRAINROT_CLIPS[clipIndex] : null;

  const step = (dir: 1 | -1) => {
    setClipIndex((prev) => {
      const base = prev === null ? (dir === 1 ? -1 : 0) : prev;
      return (base + dir + total) % total;
    });
  };

  // Create / replace the YT player whenever the active clip changes
  useEffect(() => {
    if (clipIndex === null) {
      playerRef.current?.destroy?.();
      playerRef.current = null;
      return;
    }

    let cancelled = false;
    const clip = BRAINROT_CLIPS[clipIndex];

    (async () => {
      await loadYouTubeAPI();
      if (cancelled || !window.YT?.Player) return;

      playerRef.current?.destroy?.();
      const host = document.getElementById(hostIdRef.current);
      if (!host) return;

      playerRef.current = new window.YT.Player(hostIdRef.current, {
        videoId: clip.youtubeId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          loop: 1,
          playlist: clip.youtubeId,
          playsinline: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (e: any) => {
            // Belt and suspenders — never autoplay with sound
            try {
              e.target.mute();
              e.target.playVideo();
            } catch {
              /* autoplay may be blocked until interaction — still muted */
            }
          },
          onStateChange: (e: any) => {
            // Loop: restart when ended (playlist loop can be flaky)
            if (e.data === window.YT?.PlayerState?.ENDED) {
              try {
                e.target.seekTo(0, true);
                e.target.playVideo();
                e.target.mute();
              } catch {
                /* ignore */
              }
            }
          },
        },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [clipIndex]);

  // If the user unmutes via any path, force mute back (policy: silent companion)
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => {
      try {
        if (playerRef.current?.isMuted?.() === false) {
          playerRef.current.mute();
        }
      } catch {
        /* player not ready */
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [active]);

  const destroyPlayer = useCallback(() => {
    try {
      playerRef.current?.destroy?.();
    } catch {
      /* ignore */
    }
    playerRef.current = null;
  }, []);

  useEffect(() => destroyPlayer, [destroyPlayer]);

  return (
    <div
      className={`group relative overflow-hidden border border-hairline ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Reading companion videos"
    >
      {active ? (
        <div className="absolute inset-0 bg-sumi">
          <div id={hostIdRef.current} className="h-full w-full" />
        </div>
      ) : (
        <CreaseFallback />
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 z-20">
        <span className="label-ui bg-fold/90 px-2 py-1 text-[9px] text-sumi opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {active ? `${active.label} · muted` : "Companion"}
        </span>
      </div>

      {/* Invisible arrows — visible only on hover */}
      <button
        type="button"
        aria-label="Previous video"
        onClick={() => step(-1)}
        className={`absolute left-0 top-0 z-20 flex h-full w-1/2 items-center justify-start bg-gradient-to-r from-sumi/35 to-transparent pl-3 transition-opacity duration-200 ${
          hovered ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fold/85 font-ui text-lg text-sumi">
          ‹
        </span>
      </button>
      <button
        type="button"
        aria-label="Next video"
        onClick={() => step(1)}
        className={`absolute right-0 top-0 z-20 flex h-full w-1/2 items-center justify-end bg-gradient-to-l from-sumi/35 to-transparent pr-3 transition-opacity duration-200 ${
          hovered ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fold/85 font-ui text-lg text-sumi">
          ›
        </span>
      </button>
    </div>
  );
}

function CreaseFallback() {
  return (
    <div className="absolute inset-0 bg-vermilion">
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
        <rect width="100" height="100" fill="#C34838" />
        <g stroke="#F8F4EA" fill="none" opacity="0.8">
          <path d="M10 10 L90 90 M90 10 L10 90 M50 5 L50 95 M5 50 L95 50" strokeWidth="1.2" />
          <polygon points="50,12 88,50 50,88 12,50" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}
