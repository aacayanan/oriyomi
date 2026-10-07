"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface Sentence {
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

interface AudioPlayerReturn {
  play: (
    base64Audio: string,
    onTimeUpdate: (time: number) => void,
    onEnded?: () => void,
  ) => void;
  pause: () => void;
  stop: () => void;
  setPlaybackRate: (rate: number) => void;
  setOffset: (time: number) => void;
  playbackRate: number;
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
}

export default function useAudioPlayer(): AudioPlayerReturn {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const onTimeUpdateRef = useRef<((time: number) => void) | null>(null);
  const playbackRateRef = useRef<number>(1);
  // Play-generation token: every play()/stop()/pause() bumps it. A decode
  // that resolves after being superseded is discarded without starting,
  // so racing play() calls can never stack two live sources.
  const playSeqRef = useRef(0);
  // Set on unmount: a player that has been torn down must never make
  // sound again, even if a late fetch/decode continuation calls play().
  const unmountedRef = useRef(false);

  // Rate-aware position tracking:
  // We track the audio position at the time of the last snapshot, and
  // compute the current position using elapsed real time * playback rate.
  const audioPositionRef = useRef<number>(0); // position in the buffer (seconds)
  const snapshotTimeRef = useRef<number>(0);   // AudioContext time of snapshot
  const onEndedRef = useRef<(() => void) | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);

  // Full teardown on unmount. Closing the context alone is not enough:
  // an in-flight decode could resolve and start a source on a context the
  // component no longer owns, so also invalidate the generation token,
  // stop any live source, and drop the context reference — a remounted
  // player must never reuse a closed AudioContext.
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      playSeqRef.current += 1;
      if (sourceNodeRef.current) {
        sourceNodeRef.current.onended = null;
        try {
          sourceNodeRef.current.stop();
        } catch {
          // already stopped
        }
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
      cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  /** Compute the current audio position accounting for playback rate. */
  const getAudioPosition = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return audioPositionRef.current;
    const elapsed = ctx.currentTime - snapshotTimeRef.current;
    return audioPositionRef.current + elapsed * playbackRateRef.current;
  }, []);

  const play = useCallback(
    (
      base64Audio: string,
      onTimeUpdate: (time: number) => void,
      onEnded?: () => void,
    ) => {
      // The component that owned this player is gone — a late play() from
      // an async continuation must be a no-op, not a zombie stream.
      if (unmountedRef.current) return;

      onTimeUpdateRef.current = onTimeUpdate;
      onEndedRef.current = onEnded ?? null;

      // Claim this generation — any in-flight decode from a prior play()
      // becomes stale the moment this line runs.
      const seq = ++playSeqRef.current;

      // Initialize AudioContext if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      // Stop any current source SYNCHRONOUSLY — before the async decode.
      if (sourceNodeRef.current) {
        sourceNodeRef.current.onended = null;
        try {
          sourceNodeRef.current.stop();
        } catch {
          // already stopped
        }
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
      cancelAnimationFrame(animFrameRef.current);

      // Decode base64 audio
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      ctx.decodeAudioData(bytes.buffer).then((audioBuffer) => {
        // A newer play()/stop()/pause() superseded this decode — discard it.
        // Without this check, two racing play() calls both reach start()
        // and the document plays twice.
        if (seq !== playSeqRef.current) return;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = playbackRateRef.current;
        source.connect(ctx.destination);
        sourceNodeRef.current = source;

        // Resume context if suspended
        if (ctx.state === "suspended") {
          ctx.resume();
        }

        // Start from offset
        source.start(0, offsetRef.current);

        // Snapshot: we are at offsetRef.current in the buffer, right now
        audioPositionRef.current = offsetRef.current;
        snapshotTimeRef.current = ctx.currentTime;
        startTimeRef.current = ctx.currentTime;

        setIsPlaying(true);
        setIsPaused(false);

        // Track time via requestAnimationFrame
        const tick = () => {
          const elapsed = getAudioPosition();
          setCurrentTime(elapsed);
          onTimeUpdateRef.current?.(elapsed);
          animFrameRef.current = requestAnimationFrame(tick);
        };
        animFrameRef.current = requestAnimationFrame(tick);

        source.onended = () => {
          cancelAnimationFrame(animFrameRef.current);
          setIsPlaying(false);
          setIsPaused(false);
          setCurrentTime(0);
          offsetRef.current = 0;
          audioPositionRef.current = 0;
          // Natural end only — stop/pause null out onended before this runs.
          // Fire after state clears so fold advance can start the next audio.
          const ended = onEndedRef.current;
          onEndedRef.current = null;
          ended?.();
        };
      });
    },
    [getAudioPosition],
  );

  const pause = useCallback(() => {
    // Invalidate any in-flight decode first — pausing while audio is still
    // decoding must cancel the pending start, not let it play anyway.
    playSeqRef.current += 1;
    if (!isPlaying || isPaused) return;

    // Capture current position before stopping
    const pos = getAudioPosition();

    // Save current offset for resume
    offsetRef.current = pos;
    audioPositionRef.current = pos;
    snapshotTimeRef.current = audioContextRef.current?.currentTime ?? 0;

    // Stop source node — clearing onended so pause never looks like EOF
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    onEndedRef.current = null;

    cancelAnimationFrame(animFrameRef.current);
    setIsPaused(true);
    setIsPlaying(false);
  }, [isPlaying, isPaused, getAudioPosition]);

  const stop = useCallback(() => {
    // Invalidate any in-flight decode — stop means silence, now.
    playSeqRef.current += 1;
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    onEndedRef.current = null;

    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentTime(0);
    offsetRef.current = 0;
    audioPositionRef.current = 0;
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const oldRate = playbackRateRef.current;
    playbackRateRef.current = rate;
    setPlaybackRateState(rate);

    if (sourceNodeRef.current) {
      // Snapshot the current audio position BEFORE changing rate,
      // using the OLD rate for the elapsed period.
      const ctx = audioContextRef.current;
      if (ctx) {
        const elapsed = ctx.currentTime - snapshotTimeRef.current;
        audioPositionRef.current += elapsed * oldRate;
        snapshotTimeRef.current = ctx.currentTime;
      }
      sourceNodeRef.current.playbackRate.value = rate;
    }
  }, []);

  const setOffset = useCallback((time: number) => {
    offsetRef.current = time;
  }, []);

  return { play, pause, stop, setPlaybackRate, setOffset, playbackRate, isPlaying, isPaused, currentTime };
}
