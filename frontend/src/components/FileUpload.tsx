"use client";

import { useCallback, useRef, useState } from "react";

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx"];
const ACCEPT_TYPES =
  ".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface FileUploadProps {
  onTextExtracted: (text: string) => void;
}

interface UploadedFile {
  name: string;
  size: number;
  wordCount: number;
}

type UploadStatus = "idle" | "processing" | "success";

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex === -1 ? "" : filename.slice(dotIndex).toLowerCase();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

function getErrorMessage(err: unknown, extension: string): string {
  if (err instanceof Error) {
    if (err.name === "PasswordException" || /password/i.test(err.message)) {
      return "This PDF is password-protected. Please unlock it and try again.";
    }
    if (err.name === "InvalidPDFException" || /invalid pdf|corrupt|structure/i.test(err.message)) {
      return "This file appears to be corrupt or invalid. Please try another file.";
    }
  }
  return `Failed to process this ${extension === ".pdf" ? "PDF" : "DOCX"} file. Please try another file.`;
}

async function extractTextFromPdf(
  data: ArrayBuffer,
  onProgress: (page: number, total: number) => void,
): Promise<string> {
  // Lazy-load pdf.js so it never executes during server-side rendering
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  try {
    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      onProgress(pageNum, pdf.numPages);
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) {
        pageTexts.push(pageText);
      }
    }
    return pageTexts.join("\n\n");
  } finally {
    await pdf.destroy();
  }
}

async function extractTextFromDocx(data: ArrayBuffer): Promise<string> {
  const { default: mammoth } = await import("mammoth/mammoth.browser.js");
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return result.value;
}

export default function FileUpload({ onTextExtracted }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isProcessing = status === "processing";

  const processFile = useCallback(
    async (file: File) => {
      const extension = getFileExtension(file.name);

      if (!ACCEPTED_EXTENSIONS.includes(extension)) {
        setUploadedFile(null);
        setStatus("idle");
        setError(
          `Unsupported file type${extension ? ` "${extension}"` : ""}. Please upload a .txt, .md, .pdf, or .docx file.`,
        );
        return;
      }

      if (file.size === 0) {
        setUploadedFile(null);
        setStatus("idle");
        setError("This file is empty. Please choose a file with content.");
        return;
      }

      setStatus("processing");
      setError(null);
      setProgress(extension === ".pdf" ? "Preparing PDF..." : "Extracting text...");

      try {
        const data = await file.arrayBuffer();
        let extractedText = "";

        if (extension === ".pdf") {
          extractedText = await extractTextFromPdf(data, (page, total) => {
            setProgress(`Extracting page ${page} of ${total}...`);
          });
        } else if (extension === ".docx") {
          extractedText = await extractTextFromDocx(data);
        } else {
          extractedText = new TextDecoder("utf-8").decode(data);
        }

        const trimmed = extractedText.trim();
        if (!trimmed) {
          setUploadedFile(null);
          setStatus("idle");
          setError(
            "No readable text was found in this file. It may be a scanned or image-only document.",
          );
          return;
        }

        setUploadedFile({ name: file.name, size: file.size, wordCount: countWords(trimmed) });
        setStatus("success");
        onTextExtracted(trimmed);
      } catch (err) {
        console.error("File processing failed:", err);
        setUploadedFile(null);
        setStatus("idle");
        setError(getErrorMessage(err, extension));
      } finally {
        setProgress(null);
      }
    },
    [onTextExtracted],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file && !isProcessing) {
        void processFile(file);
      }
    },
    [processFile, isProcessing],
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_TYPES}
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          // Reset so selecting the same file again still fires onChange
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={isProcessing}
        aria-label="Upload a text file"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isProcessing) setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setIsDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (!isProcessing) handleFiles(e.dataTransfer.files);
        }}
        className={[
          "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          isDragOver
            ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
            : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/50 dark:hover:border-zinc-500 dark:hover:bg-zinc-800",
          isProcessing
            ? "cursor-wait"
            : "cursor-pointer",
          error && !isProcessing
            ? "border-red-300 dark:border-red-700"
            : "",
        ].join(" ")}
      >
        {isProcessing ? (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="h-8 w-8 animate-spin text-blue-500 dark:text-blue-400"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" className="opacity-25" />
              <path d="M21 12a9 9 0 0 0-9-9" />
            </svg>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {progress ?? "Processing file..."}
            </span>
          </>
        ) : status === "success" && uploadedFile ? (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8 text-emerald-500 dark:text-emerald-400"
              aria-hidden="true"
            >
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
            </svg>
            <div className="flex max-w-full flex-col gap-0.5">
              <span
                className="max-w-full truncate text-sm font-medium text-zinc-800 dark:text-zinc-100"
                title={uploadedFile.name}
              >
                {uploadedFile.name}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {formatFileSize(uploadedFile.size)} · {uploadedFile.wordCount.toLocaleString()}{" "}
                {uploadedFile.wordCount === 1 ? "word" : "words"} extracted
              </span>
            </div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Text loaded — click to choose another file
            </span>
          </>
        ) : error ? (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8 text-red-400 dark:text-red-500"
              aria-hidden="true"
            >
              <path d="M12 3 2.5 20h19L12 3z" />
              <path d="M12 10v4" />
              <circle cx="12" cy="17.2" r="0.8" fill="currentColor" stroke="none" />
            </svg>
            <span className="text-sm font-medium text-red-700 dark:text-red-300">{error}</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Click to try another file
            </span>
          </>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8 text-zinc-400 dark:text-zinc-500"
              aria-hidden="true"
            >
              <path d="M12 16V4m0 0-4 4m4-4 4 4" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Drag &amp; drop a file here, or click to browse
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Accepts .txt, .md, .pdf, and .docx
            </span>
          </>
        )}
      </button>
    </div>
  );
}
