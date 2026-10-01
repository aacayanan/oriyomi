"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface Sentence {
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

interface AudioPlayerReturn {
  play: (base64Audio: string, onTimeUpdate: (time: number) => void) => void;
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

  // Rate-aware position tracking:
  // We track the audio position at the time of the last snapshot, and
  // compute the current position using elapsed real time * playback rate.
  const audioPositionRef = useRef<number>(0); // position in the buffer (seconds)
  const snapshotTimeRef = useRef<number>(0);   // AudioContext time of snapshot

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
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
    (base64Audio: string, onTimeUpdate: (time: number) => void) => {
      onTimeUpdateRef.current = onTimeUpdate;

      // Initialize AudioContext if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      // Decode base64 audio
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      ctx.decodeAudioData(bytes.buffer).then((audioBuffer) => {
        // Disconnect previous source if any
        if (sourceNodeRef.current) {
          sourceNodeRef.current.disconnect();
          sourceNodeRef.current.stop();
        }

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
        };
      });
    },
    [getAudioPosition],
  );

  const pause = useCallback(() => {
    if (!isPlaying || isPaused) return;

    // Capture current position before stopping
    const pos = getAudioPosition();

    // Save current offset for resume
    offsetRef.current = pos;
    audioPositionRef.current = pos;
    snapshotTimeRef.current = audioContextRef.current?.currentTime ?? 0;

    // Stop source node
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
    }

    cancelAnimationFrame(animFrameRef.current);
    setIsPaused(true);
    setIsPlaying(false);
  }, [isPlaying, isPaused, getAudioPosition]);

  const stop = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
    }

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
