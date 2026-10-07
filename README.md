# oriyomi

> ori—to fold, yomi—to read. Sentence-sync read-along that folds a document into speech.

oriyomi turns dense study material into something you can actually get through. Upload a textbook chapter, notes, or a PDF, and it becomes a listen-along experience: natural neural speech plays while the exact sentence being spoken is highlighted on screen. Optional comprehension quizzes close the loop — because hearing a chapter and understanding it are not the same thing.

## Why oriyomi

Dense textbooks are overwhelming. A wall of text is hard to start, hard to stay oriented inside, and easy to abandon halfway through a chapter. Existing read-aloud tools either don't lock eyes and ears on the same sentence, or hide good neural voices behind API keys and paid usage.

oriyomi was built from that frustration. The name blends two Japanese words — **ori** (折り, to fold) and **yomi** (読み, to read). Like origami, you start with a flat, overwhelming sheet of paper. The parser creases it into logical sections; each section folds into clean speech you can follow along with. You aren't just hearing a textbook — you're reshaping it into something structured and digestible, one fold at a time.

## What it does

1. **Bring your material** — upload `.txt`, `.md`, `.pdf`, or `.docx`, or paste text directly.
2. **Fold the document** — structure detection surfaces chapters and sections automatically.
3. **Listen and read along** — sentence-level timestamps highlight the exact sentence being spoken, at any speed (0.5×–2.0×).
4. **Check yourself** — an optional Gemini-powered comprehension quiz verifies you actually understood the fold.

No accounts. No subscriptions. No paid speech APIs. Free Microsoft Edge neural voices power the whole reading experience.

## Features

- **Sentence-sync read-along** — the player highlights the sentence being spoken, driven by word-boundary timestamps from the TTS engine
- **Document structure detection** — chapters and sections are detected and turned into parallel "folds"; the first fold plays while the rest are still generating
- **9 curated free US English voices** — the best Microsoft Edge neural voices, no API key required
- **Adjustable speed** — 0.5× to 2.0×, applied live without re-generating audio
- **Text zoom** — scale the reading pane to your eyes
- **Optional comprehension quiz** — Gemini-generated multiple-choice questions with explanations; the reader works fully without a Gemini key
- **Zero gates** — paste or upload and listen; nothing stands between you and the material

## Quick start

### Prerequisites

- Docker and Docker Compose

### Run everything

```bash
cp .env.example .env   # optional: add GEMINI_API_KEY for the quiz
docker compose up --build
```

- Frontend: **http://localhost:3000**
- API: **http://localhost:8000**

The Next.js app proxies `/api/*` to the backend, so the browser never needs to know where the API lives.

### Run without Docker

Backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**. Point the frontend at the API with `API_PROXY_URL=http://localhost:8000` (or `NEXT_PUBLIC_API_URL` if you prefer a direct browser call).

### Environment

| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | frontend | **Yes (deployed)** | Supabase project URL. Inlined at build time from `frontend/.env.local` locally. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | frontend | **Yes (deployed)** | Supabase publishable (anon) key. Same inlining rules. |
| `GEMINI_API_KEY` | app | No | Enables the comprehension quiz. Without it, the reader still works; the quiz degrades gracefully. |
| `SUPABASE_URL` | app | No | FastAPI: persistent words-folded counter. Falls back to in-memory counting when unset. |
| `SUPABASE_SERVICE_ROLE_KEY` | app | No | FastAPI: service-role key backing the counter RPC. |
| `FFMPEG_PATH` | app | No | Explicit ffmpeg binary for MP3 chunk merging. Defaults to the static binary bundled via `imageio-ffmpeg`, then PATH. |
| `ALLOWED_ORIGINS` | app | No | CORS origins for direct browser → API calls. Defaults to `http://localhost:3000,http://127.0.0.1:3000`. Unused when the Next.js proxy is in play. |
| `API_PROXY_URL` | frontend (Docker) | No | Where the Next dev/proxy forwards `/api/*`. Defaults to `http://localhost:8000`. |

### Deploying to Vercel

The two `NEXT_PUBLIC_SUPABASE_*` vars **must** be set in the Vercel project
(Settings → Environment Variables, scoped to the **frontend** service) before
the first deploy. They are inlined into the client bundle at build time — a
deployment without them builds cleanly but every page returns
`500 Internal Server Error` (the auth middleware has no project to talk to).
After adding or changing them, **redeploy** so the bundle is rebuilt.

The `app` (FastAPI) service vars are optional; without them the reader and
TTS still work and only the persistent stats counter / quiz degrade.

Local setup: copy the values from your Supabase project into
`frontend/.env.local` (see `frontend/.env.example`).

## The TTS API

The FastAPI backend is also usable on its own — free text-to-speech with sentence-level timestamps, no API key.

### `GET /api/voices`

Returns the 9 highest-quality US English voices, ordered best first.

**Response:**
```json
[
  {
    "id": "en-US-AvaMultilingualNeural",
    "name": "Microsoft AvaMultilingual Online (Natural) - English (United States)",
    "locale": "en-US"
  },
  {
    "id": "en-US-EmmaMultilingualNeural",
    "name": "Microsoft EmmaMultilingual Online (Natural) - English (United States)",
    "locale": "en-US"
  },
  {
    "id": "en-US-AndrewMultilingualNeural",
    "name": "Microsoft AndrewMultilingual Online (Natural) - English (United States)",
    "locale": "en-US"
  },
  {
    "id": "en-US-BrianMultilingualNeural",
    "name": "Microsoft BrianMultilingual Online (Natural) - English (United States)",
    "locale": "en-US"
  },
  {
    "id": "en-US-AriaNeural",
    "name": "Microsoft Aria Online (Natural) - English (United States)",
    "locale": "en-US"
  },
  {
    "id": "en-US-JennyNeural",
    "name": "Microsoft Jenny Online (Natural) - English (United States)",
    "locale": "en-US"
  },
  {
    "id": "en-US-GuyNeural",
    "name": "Microsoft Guy Online (Natural) - English (United States)",
    "locale": "en-US"
  },
  {
    "id": "en-US-ChristopherNeural",
    "name": "Microsoft Christopher Online (Natural) - English (United States)",
    "locale": "en-US"
  },
  {
    "id": "en-US-MichelleNeural",
    "name": "Microsoft Michelle Online (Natural) - English (United States)",
    "locale": "en-US"
  }
]
```

### `POST /api/tts`

Generate speech audio from text.

Always synchronous: long texts split at sentence boundaries and every chunk generates concurrently inside the request, then merges with ffmpeg — no task queue, no polling.

**Request body:**
```json
{
  "text": "Hello world. This is a test.",
  "voice": "en-US-EmmaMultilingualNeural",
  "speed": 1.0
}
```

| Field    | Type   | Default                       | Description                               |
|----------|--------|-------------------------------|-------------------------------------------|
| `text`   | string | (required)                    | Text to synthesize (1–50000 chars)        |
| `voice`  | string | `en-US-EmmaMultilingualNeural` | Voice short name                          |
| `speed`  | float  | `1.0`                         | Speech rate (0.5 = half, 2.0 = double)   |

**Response:**
```json
{
  "audio_base64": "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4...",
  "sentences": [
    {
      "text": "Hello world.",
      "start_ms": 0,
      "end_ms": 820
    },
    {
      "text": "This is a test.",
      "start_ms": 820,
      "end_ms": 1640
    }
  ],
  "voice": "en-US-EmmaMultilingualNeural",
  "speed": 1.0
}
```

### `POST /api/tts/fold`

Generate one fold (section) of a document. The reader client fires these in parallel — one request per fold — so folds generate concurrently and the first completed fold plays while the rest are still running.

**Request body:**
```json
{
  "text": "Glycolysis is the first step in cellular respiration...",
  "voice": "en-US-EmmaMultilingualNeural",
  "speed": 1.0,
  "fold_index": 0,
  "title": "Glycolysis"
}
```

| Field        | Type   | Default                        | Description                          |
|--------------|--------|--------------------------------|--------------------------------------|
| `text`       | string | (required)                     | This fold's text (1–50000 chars)     |
| `voice`      | string | `en-US-EmmaMultilingualNeural` | Voice short name                     |
| `speed`      | float  | `1.0`                          | Speech rate                          |
| `fold_index` | int    | `0`                            | Position of the fold in the document |
| `title`      | string | `""`                           | Section title (defaults to Fold NN)  |

**Response:** same shape as `/api/tts` plus `fold_index`, `title`, and `duration_ms`.

### `GET /api/health`

Health check. Returns `{"status": "ok"}`.

### Usage from JavaScript

```javascript
const res = await fetch('http://localhost:8000/api/tts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Hello world. This is a test.',
    voice: 'en-US-EmmaMultilingualNeural',
    speed: 1.0,
  }),
});

const { audio_base64, sentences } = await res.json();

// Play audio
const audio = new Audio(`data:audio/mpeg;base64,${audio_base64}`);
audio.play();

// Use sentences for text highlighting
// sentences[i].start_ms / end_ms tell you when each sentence plays
```

## Voices

The `/api/voices` endpoint returns 9 curated high-quality US English voices, ordered best first:

| Voice ID                          | Type      | Gender |
|-----------------------------------|-----------|--------|
| `en-US-AvaMultilingualNeural`    | HD (newest) | Female |
| `en-US-EmmaMultilingualNeural`   | HD (newest) | Female |
| `en-US-AndrewMultilingualNeural` | HD (newest) | Male   |
| `en-US-BrianMultilingualNeural`  | HD (newest) | Male   |
| `en-US-AriaNeural`              | Neural    | Female |
| `en-US-JennyNeural`              | Neural    | Female |
| `en-US-GuyNeural`               | Neural    | Male   |
| `en-US-ChristopherNeural`       | Neural    | Male   |
| `en-US-MichelleNeural`          | Neural    | Female |

The four **Multilingual** voices are Microsoft's newest HD generation. The rest are the strongest of the classic neural voices. Lower-quality voices (child, telephony, and superseded duplicates) have been excluded.

## Project structure

```
├── main.py            # FastAPI app — /api/voices, /api/tts, /api/tts/fold, /api/health
├── tts.py             # TTS engine (edge-tts, sentence splitting, timestamp mapping)
├── text_structure.py  # Chapter/section detection for fold generation
├── summaries.py       # Optional per-fold summaries
├── requirements.txt   # Python dependencies
├── Dockerfile         # Backend container image
├── docker-compose.yml # Frontend + backend
├── vercel.json        # Vercel deploy: Next.js frontend + FastAPI backend
├── frontend/          # Next.js / React / Tailwind reader UI
└── README.md
```

## License

MIT
