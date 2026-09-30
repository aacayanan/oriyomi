"use client";

import { useState, useEffect, useCallback } from "react";
import useAudioPlayer from "./useAudioPlayer";
import TextBox from "./TextBox";
import TextViewer from "./TextViewer";
import Controls from "./Controls";
import { apiUrl } from "@/lib/api";

interface Voice {
  id: string;
  name: string;
  locale: string;
}

interface Sentence {
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

export default function TextReader() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("en-US-EmmaMultilingualNeural");
  const [speed, setSpeed] = useState(1.0);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);

  const audioPlayer = useAudioPlayer();

  // Fetch available voices on mount
  useEffect(() => {
    fetch(apiUrl("/api/voices"))
      .then((res) => res.json())
      .then((data) => {
        setVoices(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error("Failed to fetch voices:", err));
  }, []);

  // Track active sentence via playback time
  const handleTimeUpdate = useCallback(
    (currentTime: number) => {
      if (sentences.length === 0) return;

      for (let i = sentences.length - 1; i >= 0; i--) {
        if (currentTime >= sentences[i].start_ms / 1000) {
          setActiveSentenceIndex(i);
          return;
        }
      }
      setActiveSentenceIndex(0);
    },
    [sentences],
  );

  const handleClear = useCallback(() => {
    audioPlayer.stop();
    setText("");
    setSentences([]);
    setActiveSentenceIndex(null);
    setAudioBase64(null);
  }, [audioPlayer]);

  const handlePlay = useCallback(async () => {
    // If paused, resume
    if (audioPlayer.isPaused && audioBase64) {
      audioPlayer.play(audioBase64, handleTimeUpdate);
      return;
    }

    if (!text.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/tts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, speed }),
      });
      const data = await res.json();

      setAudioBase64(data.audio_base64);
      setSentences(data.sentences || []);
      setActiveSentenceIndex(null);

      audioPlayer.play(data.audio_base64, handleTimeUpdate);
    } catch (err) {
      console.error("TTS request failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [text, voice, speed, audioPlayer, audioBase64, handleTimeUpdate]);

  const handlePause = useCallback(() => {
    audioPlayer.pause();
  }, [audioPlayer]);

  const handleStop = useCallback(() => {
    audioPlayer.stop();
    setActiveSentenceIndex(null);
  }, [audioPlayer]);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Text-to-Speech Reader
      </h1>

      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        {/* Left column: paste area (compact) */}
        <div className="w-full shrink-0 lg:w-80">
          <TextBox text={text} onChange={setText} onClear={handleClear} />
        </div>

        {/* Right column: text viewer (main display) */}
        <div className="flex min-h-[300px] flex-1 flex-col lg:min-h-0">
          <TextViewer
            sentences={sentences}
            activeSentenceIndex={activeSentenceIndex}
            text={text}
          />
        </div>
      </div>

      <Controls
        voice={voice}
        onVoiceChange={setVoice}
        speed={speed}
        onSpeedChange={setSpeed}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        isPlaying={audioPlayer.isPlaying}
        isPaused={audioPlayer.isPaused}
        isLoading={isLoading}
        voices={voices}
      />
    </div>
  );
}
