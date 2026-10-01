"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import useAudioPlayer from "./useAudioPlayer";
import useTTSJob from "@/hooks/useTTSJob";
import TextBox from "./TextBox";
import FileUpload from "./FileUpload";
import TextViewer from "./TextViewer";
import Controls from "./Controls";
import Waveform from "./Waveform";
import Quiz from "./Quiz";
import ChapterSelector from "./ChapterSelector";
import type { Section } from "./ChapterSelector";
import { apiUrl } from "@/lib/api";

interface Voice {
  id: string;
  name: string;
  locale: string;
  display_name: string;
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
  const [error, setError] = useState<string | null>(null);

  // Document structure state
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [hasStructure, setHasStructure] = useState(false);
  const [docType, setDocType] = useState("flat");

  const audioPlayer = useAudioPlayer();
  const ttsJob = useTTSJob();

  // Keep the latest sentences in a ref so the time-update callback stored by
  // the audio player always reads current sentence timings, even after the
  // sentences array is replaced (e.g. when audio is regenerated for a speed
  // change). handleTimeUpdate is therefore stable and never goes stale.
  const sentencesRef = useRef<Sentence[]>([]);

  const updateSentences = useCallback((next: Sentence[]) => {
    sentencesRef.current = next;
    setSentences(next);
  }, []);

  // Analyze text structure to detect chapters/sections
  const analyzeText = useCallback(async (textToAnalyze: string) => {
    if (!textToAnalyze.trim() || textToAnalyze.trim().length < 50) {
      setSections([]);
      setSelectedSection(null);
      setHasStructure(false);
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToAnalyze }),
      });
      const data = await res.json();
      if (res.ok) {
        setSections(data.sections || []);
        setHasStructure(data.has_structure || false);
        setDocType(data.doc_type || "flat");
        setSelectedSection(null);
      }
    } catch (err) {
      console.error("Analysis failed:", err);
    }
  }, []);

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
  const handleTimeUpdate = useCallback((currentTime: number) => {
    const current = sentencesRef.current;
    if (current.length === 0) return;

    for (let i = current.length - 1; i >= 0; i--) {
      if (currentTime >= current[i].start_ms / 1000) {
        setActiveSentenceIndex(i);
        return;
      }
    }
    setActiveSentenceIndex(0);
  }, []);

  const handleClear = useCallback(() => {
    ttsJob.cancelJob();
    audioPlayer.stop();
    setText("");
    updateSentences([]);
    setActiveSentenceIndex(null);
    setAudioBase64(null);
    setIsLoading(false);
    setSections([]);
    setSelectedSection(null);
    setHasStructure(false);
  }, [audioPlayer, updateSentences, ttsJob]);

  // File upload: extracted text replaces the current text and resets any
  // stale audio/sentence state (same cleanup as clearing).
  const handleFileExtracted = useCallback(
    (extractedText: string) => {
      audioPlayer.stop();
      setText(extractedText);
      updateSentences([]);
      setActiveSentenceIndex(null);
      setAudioBase64(null);
      setError(null);
      analyzeText(extractedText);
    },
    [audioPlayer, updateSentences, analyzeText],
  );

  // Generate TTS audio at `newSpeed`. If `resumeFrom` is given (a position in
  // the previous audio), playback resumes at the equivalent point in the new
  // audio — mapped by content fraction so the listener stays at the same
  // place in the text even though the total duration changed with speed.
  const regenerateTTS = useCallback(
    async (newSpeed: number, resumeFrom?: number) => {
      // Use selected section's text if one is selected, otherwise full text
      const textToGenerate = selectedSection ? selectedSection.text : text;
      if (!textToGenerate.trim()) return;

      setIsLoading(true);
      setError(null);

      try {
        // Normalize text before sending: collapse whitespace for better TTS
        const normalizedText = textToGenerate
          .replace(/[\t\n\r]+/g, " ")
          .replace(/ {2,}/g, " ")
          .trim();

        const result = await ttsJob.submitJob(normalizedText, voice, newSpeed);
        if (!result) return; // cancelled

        const newSentences: Sentence[] = result.sentences || [];
        const oldSentences = sentencesRef.current;
        const oldDuration =
          oldSentences.length > 0 ? oldSentences[oldSentences.length - 1].end_ms / 1000 : 0;
        const newDuration =
          newSentences.length > 0 ? newSentences[newSentences.length - 1].end_ms / 1000 : 0;

        // Map the previous position onto the new audio by content fraction
        let startOffset = 0;
        if (resumeFrom !== undefined && resumeFrom > 0 && newDuration > 0) {
          const fraction = oldDuration > 0 ? Math.min(resumeFrom / oldDuration, 1) : 0;
          startOffset = fraction * newDuration;
        }

        updateSentences(newSentences);
        setActiveSentenceIndex(null);
        setAudioBase64(result.audio_base64);

        audioPlayer.setOffset(startOffset);
        audioPlayer.play(result.audio_base64, handleTimeUpdate);
      } catch (err) {
        console.error("TTS request failed:", err);
        setError(err instanceof Error ? err.message : "Failed to generate speech. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [text, selectedSection, voice, audioPlayer, handleTimeUpdate, updateSentences, ttsJob],
  );

  const handlePlay = useCallback(async () => {
    // If paused, resume from the saved offset
    if (audioPlayer.isPaused && audioBase64) {
      audioPlayer.play(audioBase64, handleTimeUpdate);
      return;
    }

    await regenerateTTS(speed);
  }, [audioPlayer.isPaused, audioBase64, handleTimeUpdate, regenerateTTS, speed]);

  // Speed changes apply live via Web Audio playbackRate — instant, no recompile.
  // The speed is still sent to the API when TTS is next generated (on play from
  // a fresh start), so newly generated audio is baked at the correct rate.
  const handleSpeedChange = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
      // Apply immediately to the live audio node if anything is playing or paused
      if (audioPlayer.isPlaying || audioPlayer.isPaused) {
        audioPlayer.setPlaybackRate(newSpeed);
      }
    },
    [audioPlayer],
  );

  const handleSentenceClick = useCallback(
    (index: number) => {
      if (sentences.length === 0 || !audioBase64) return;

      const sentence = sentences[index];
      if (!sentence) return;

      // Stop current playback
      audioPlayer.stop();

      // Set offset to the sentence's start time (start_ms is in milliseconds, convert to seconds)
      audioPlayer.setOffset(sentence.start_ms / 1000);

      // Set active sentence
      setActiveSentenceIndex(index);

      // Start playback from that point
      audioPlayer.play(audioBase64, handleTimeUpdate);
    },
    [sentences, audioBase64, audioPlayer, handleTimeUpdate],
  );

  // Seek from the progress bar or waveform: restart playback at the requested position
  const handleSeek = useCallback(
    (time: number) => {
      if (!audioBase64) return;

      const clamped = Math.max(0, time);
      audioPlayer.stop();
      audioPlayer.setOffset(clamped);
      // Keep the active sentence (and waveform region) in sync with the jump
      const current = sentencesRef.current;
      for (let i = current.length - 1; i >= 0; i--) {
        if (clamped >= current[i].start_ms / 1000) {
          setActiveSentenceIndex(i);
          break;
        }
      }
      audioPlayer.play(audioBase64, handleTimeUpdate);
    },
    [audioBase64, audioPlayer, handleTimeUpdate],
  );

  const handlePause = useCallback(() => {
    audioPlayer.pause();
  }, [audioPlayer]);

  const handleStop = useCallback(() => {
    ttsJob.cancelJob();
    audioPlayer.stop();
    setActiveSentenceIndex(null);
    setIsLoading(false);
  }, [audioPlayer, ttsJob]);

  // Total playback duration from the last sentence's end time
  const duration =
    sentences.length > 0 ? sentences[sentences.length - 1].end_ms / 1000 : 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Text-to-Speech Reader
      </h1>

      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        {/* Left column: file upload + paste area (compact) */}
        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
          <FileUpload onTextExtracted={handleFileExtracted} />
          <TextBox text={text} onChange={setText} onClear={handleClear} />
        </div>

        {/* Right column: text viewer (main display) */}
        <div className="flex min-h-[300px] flex-1 flex-col lg:min-h-0">
          <TextViewer
            sentences={sentences}
            activeSentenceIndex={activeSentenceIndex}
            text={text}
            onSentenceClick={handleSentenceClick}
            currentSectionTitle={selectedSection ? selectedSection.title : null}
          />
        </div>
      </div>

      {/* Interactive waveform: seek, time display, active sentence highlighted */}
      <Waveform
        audioBase64={audioBase64}
        sentences={sentences}
        activeSentenceIndex={activeSentenceIndex}
        onSeek={handleSeek}
        isPlaying={audioPlayer.isPlaying}
        currentTime={audioPlayer.currentTime}
        duration={duration}
      />

      <Controls
        voice={voice}
        onVoiceChange={setVoice}
        speed={speed}
        onSpeedChange={handleSpeedChange}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onCancel={handleStop}
        isPlaying={audioPlayer.isPlaying}
        isPaused={audioPlayer.isPaused}
        isLoading={isLoading}
        voices={voices}
      />

      {/* Chapter/section selector for structure-aware TTS */}
      {hasStructure && (
        <ChapterSelector
          sections={sections}
          selectedSection={selectedSection}
          onSelect={setSelectedSection}
          disabled={isLoading}
          docType={docType}
        />
      )}

      {/* TTS generation progress */}
      {isLoading && ttsJob.progress && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/30">
          <div className="flex items-center justify-between text-sm text-blue-700 dark:text-blue-300">
            <span>Generating speech...</span>
            <span>
              {ttsJob.progress.chunk} / {ttsJob.progress.total} chunks
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-200 dark:bg-blue-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{
                width: `${(ttsJob.progress.chunk / ttsJob.progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Quiz: generate comprehension questions after reading/listening */}
      <Quiz text={text} disabled={!text.trim()} />

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
