# Text Reader — TTS API

Free text-to-speech API using Microsoft Edge's neural TTS voices. Returns audio with sentence-level timestamps for synchronizing text highlighting with playback.

## Features

- **300+ natural-sounding voices** — powered by Microsoft Edge's neural TTS (completely free, no API key needed)
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

Returns all available TTS voices.

**Response:**
```json
[
  {
    "id": "en-US-EmmaMultilingualNeural",
    "name": "Emma",
    "locale": "en-US"
  }
]
```

### `POST /api/tts`

Generate speech audio from text.

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
| `text`   | string | (required)                    | Text to synthesize (1–5000 chars)         |
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

## Popular Voices

| Voice ID                          | Language | Style            |
|-----------------------------------|----------|------------------|
| `en-US-EmmaMultilingualNeural`   | English  | Warm, natural    |
| `en-US-AvaMultilingualNeural`    | English  | Friendly         |
| `en-US-AndrewNeural`             | English  | Professional     |
| `en-GB-SoniaNeural`              | British  | Clear            |
| `en-AU-NatashaNeural`            | Australian | Conversational |
| `ja-JP-NanamiNeural`             | Japanese | Natural          |
| `ko-KR-SunHiNeural`              | Korean   | Natural          |

## Project structure

```
├── main.py           # FastAPI app with /api/voices, /api/tts, /api/health
├── tts.py            # TTS engine (edge-tts wrapper, sentence splitting, timestamp mapping)
├── requirements.txt  # Python dependencies
├── Dockerfile        # Container image definition
├── docker-compose.yml # Docker Compose config
└── README.md
```

## License

MIT
