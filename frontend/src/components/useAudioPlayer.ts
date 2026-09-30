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
        startTimeRef.current = ctx.currentTime - offsetRef.current;
        setIsPlaying(true);
        setIsPaused(false);

        // Track time via requestAnimationFrame
        const tick = () => {
          if (!audioContextRef.current) return;
          const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
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
        };
      });
    },
    [],
  );

  const pause = useCallback(() => {
    if (!isPlaying || isPaused) return;

    // Save current offset
    if (audioContextRef.current) {
      offsetRef.current = audioContextRef.current.currentTime - startTimeRef.current;
    }

    // Stop source node
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
    }

    cancelAnimationFrame(animFrameRef.current);
    setIsPaused(true);
    setIsPlaying(false);
  }, [isPlaying, isPaused]);

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
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    playbackRateRef.current = rate;
    setPlaybackRateState(rate);
    if (sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.value = rate;
    }
  }, []);

  const setOffset = useCallback((time: number) => {
    offsetRef.current = time;
  }, []);

  return { play, pause, stop, setPlaybackRate, setOffset, playbackRate, isPlaying, isPaused, currentTime };
}
