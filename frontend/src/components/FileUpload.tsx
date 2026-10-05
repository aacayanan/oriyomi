"use client";

import { useCallback, useRef, useState } from "react";
import { UploadIcon, AlertIcon } from "./Icons";

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
      return "This PDF is password-protected. Unlock it and try again.";
    }
    if (
      err.name === "InvalidPDFException" ||
      /invalid pdf|corrupt|structure/i.test(err.message)
    ) {
      return "This file appears to be corrupt or invalid. Try another file.";
    }
  }
  return `Failed to process this ${extension === ".pdf" ? "PDF" : "DOCX"} file. Try another file.`;
}

async function extractTextFromPdf(
  data: ArrayBuffer,
  onProgress: (page: number, total: number) => void,
): Promise<string> {
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
          `Unsupported file type${extension ? ` "${extension}"` : ""}. Use .txt, .md, .pdf, or .docx.`,
        );
        return;
      }

      if (file.size === 0) {
        setUploadedFile(null);
        setStatus("idle");
        setError("This file is empty. Choose a file with content.");
        return;
      }

      setStatus("processing");
      setError(null);
      setProgress(extension === ".pdf" ? "Preparing PDF…" : "Extracting text…");

      try {
        const data = await file.arrayBuffer();
        let extractedText = "";

        if (extension === ".pdf") {
          extractedText = await extractTextFromPdf(data, (page, total) => {
            setProgress(`Extracting page ${page} of ${total}…`);
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
            "No readable text in this file. It may be a scanned or image-only document.",
          );
          return;
        }

        setUploadedFile({
          name: file.name,
          size: file.size,
          wordCount: countWords(trimmed),
        });
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
          "flex w-full flex-col items-center justify-center gap-2 border border-dashed px-4 py-5 text-center transition-colors",
          isDragOver
            ? "border-vermilion bg-fold"
            : "border-hairline-deep bg-fold/60 hover:border-ink-mute hover:bg-fold",
          isProcessing ? "cursor-wait" : "cursor-pointer",
          error && !isProcessing ? "border-vermilion-soft" : "",
        ].join(" ")}
      >
        {isProcessing ? (
          <>
            <span
              className="h-6 w-6 animate-spin rounded-full border-2 border-hairline-deep border-t-vermilion"
              aria-hidden="true"
            />
            <span className="font-ui text-xs font-semibold text-sumi-soft">
              {progress ?? "Processing file…"}
            </span>
          </>
        ) : status === "success" && uploadedFile ? (
          <>
            <UploadIcon className="h-6 w-6 text-vermilion" />
            <div className="flex max-w-full flex-col gap-0.5">
              <span
                className="max-w-full truncate font-ui text-xs font-semibold text-sumi"
                title={uploadedFile.name}
              >
                {uploadedFile.name}
              </span>
              <span className="font-data label-lg tabular-nums text-ink-fade">
                {formatFileSize(uploadedFile.size)} ·{" "}
                {uploadedFile.wordCount.toLocaleString()} words
              </span>
            </div>
            <span className="label-ui label-sm text-ink-mute">
              Ready — drop another
            </span>
          </>
        ) : error ? (
          <>
            <AlertIcon className="h-6 w-6 text-vermilion" />
            <span className="font-ui text-xs font-semibold text-vermilion-ink">
              {error}
            </span>
            <span className="label-ui label-sm text-ink-mute">
              Try another
            </span>
          </>
        ) : (
          <>
            <UploadIcon className="h-6 w-6 text-ink-fade" />
            <span className="font-ui text-xs font-semibold text-sumi-soft">
              Drop one in, or browse
            </span>
            <span className="font-data label-lg text-ink-fade">
              .txt · .md · .pdf · .docx
            </span>
          </>
        )}
      </button>
    </div>
  );
}
