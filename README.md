# Text Reader — TTS API

Free text-to-speech API using Microsoft Edge's neural TTS voices. Returns audio with sentence-level timestamps for synchronizing text highlighting with playback.

## Features

- **9 curated high-quality US English voices** — the best neural voices from Microsoft Edge TTS (free, no API key needed)
- **Sentence-level timestamps** — word boundary events mapped to sentences for text highlighting
- **Adjustable speed** — 0.5x to 2.0x speech rate
- **Base64 audio response** — easy to consume from any frontend

## Setup

### Prerequisites

- Docker and Docker Compose

### Run with Docker

```bash
docker compose up --build
```

The API starts at **http://localhost:8000**.

### Run without Docker

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## API

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

## Usage from JavaScript

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

## Voice List

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
├── main.py           # FastAPI app with /api/voices, /api/tts, /api/tts/fold, /api/health
├── tts.py            # TTS engine (edge-tts wrapper, sentence splitting, timestamp mapping)
├── requirements.txt  # Python dependencies
├── Dockerfile        # Container image definition
├── docker-compose.yml # Docker Compose config
└── README.md
```

## License

MIT
