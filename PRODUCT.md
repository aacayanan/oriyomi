# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Learners & students who sit with course PDFs, notes, or textbooks. They listen through their own study material and use the comprehension quiz to verify they understood it. Success is measured by the learner's comprehension, not by playback volume.

## Product Purpose

Turn documents (PDF, DOCX, MD, TXT, or pasted text) into synchronized listen-and-read experiences: natural neural speech plays while the exact sentence being spoken is highlighted, and an optional quiz closes the loop by checking comprehension. A learner can load their own study material, follow along by ear and eye, and leave knowing whether they understood it — all without accounts, subscriptions, or speech API keys.

## Positioning

Sentence-sync read-along. The player highlights the exact sentence being spoken at any speed, driven by sentence-level timestamps from the TTS engine. That tight eye–ear lock on a real document the learner brings themselves is the claim neighboring tools (browser read-aloud, commercial readers) cannot truthfully copy for this user.

## Operating Context

Portfolio piece — the craft of the build matters as much as serving users; the product demonstrates skill. Work runs locally via Docker Compose: FastAPI + Celery + Redis backend (edge-tts; Gemini for quizzes) and a Next.js / React / Tailwind frontend.

Learner workflow: upload or paste text → structure detection offers chapters/sections → generate speech per section → read along with sentence highlighting and zoom → optional Gemini comprehension quiz.

## Capabilities and Constraints

Confirmed capabilities:

- Upload .txt/.md/.pdf/.docx (client-side text extraction) or paste text
- Automatic document-structure detection (chapters/sections) with section-level TTS generation
- 9 curated free Microsoft Edge neural US English voices; speed 0.5×–2.0×
- Sentence-level timestamps drive read-along highlighting; text zoom controls
- Long texts are chunked through a Celery chord with SSE progress and job cancel
- Optional Gemini-powered multiple-choice comprehension quiz (1–8 questions) with explanations

Durable constraints:

- **Free TTS only** — speech stays on free Edge neural voices; never gate audio behind paid APIs
- **No accounts** — no login or multi-user; the flow stays single-user and instant
- **Quiz stays optional** — the app is fully usable without `GEMINI_API_KEY`; the quiz degrades gracefully

Open product facts (recorded, not decided):

- Locale: only en-US voices are curated today; multi-language support is undecided (not a binding constraint)
- Deployment: intended as a portfolio piece; public hosting undecided
- Persistence: no saved documents, history, or listening positions across sessions today
- The quiz's role may grow, but it is an enhancement today, not the core

## Brand Commitments

Working name "Text Reader" (repo and README). No committed visual identity, voice, or brand assets; page metadata still carries the create-next-app default. Nothing else is binding.

## Evidence on Hand

- The working application itself: FastAPI backend (`main.py`) and Next.js frontend (`frontend/src`) implementing the full listen–read–quiz loop
- `README.md` documenting the TTS API and the curated voice table
- No user research, testimonials, case studies, press, or usage metrics exist — future work must not fabricate social proof

## Product Principles

1. **The sentence is the unit of truth.** Timing data drives highlighting; anything that desyncs eyes and ears is a defect, not a polish item.
2. **Comprehension over consumption.** The loop ends in understanding (listen → follow along → optionally prove it), not in playback.
3. **Zero gates.** Paste or upload and listen: no accounts, no paid speech APIs, no key required for the core reading experience.
4. **Optional must stay optional.** Enhancements like the Gemini quiz degrade gracefully and never become dependencies of the core.
5. **Craft is the deliverable.** As a portfolio piece, build quality and design execution are themselves the product's purpose.
