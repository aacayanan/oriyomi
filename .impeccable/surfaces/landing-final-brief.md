# Landing final — user-directed composite (2016-10-03)

Mode: Persuade. One landing page, assembled from the five mockups under the user's direction. Not five versions — this is the page.

## User's picks (verbatim intent)

- **Base structure = V4 jacket/obi** (they like v4 the most).
- **Colors = the live app** (not the mockup palettes). washi / fold / vermilion / sumi / gold / ink-fade from `frontend/src/app/globals.css`.
- **Background texture = V5** (washi ground + fine paper grain/grid feel).
- **Navbar = V5 masthead** (crane mark, oriyomi wordmark, Vol. 01 · Free issue block, hairline rules).
- **Font = V4** (Shippori Mincho + Sometype Mono) for this page **and** the live app (app change is a parallel task).
- **Hero = V4 cover**, recolored to live tokens. Keep:
  - the hanko seal character (折) — "the character is interesting, might be worth keeping with the image in mind"
  - the ori/yomi characters 折り / 読み
  - the hero metadata list (Input / Voices / Speed / Account)
- **Hero plate** = red paper crane via Higgsfield, slot stays V4 geometry (3:4 right column). Image path: `plates/crane-hero.png` (or `.webp`); flat CSS stand-in until the file exists.
- **Red bar = V4 obi**: "Bring the chapter you keep postponing. Press play, and read along." + "Try it out" CTA. Recolor to live vermilion `#c34838`.
- **Book section = V4 flaps** — entire section with **"Yomi means to read."** and **"The lit sentence is the spoken sentence."** Two columns with the gutter seam stay. **The inner reader mock must mimic the real live app view** (three-zone desk language: fold rail/cards, center sheet with lit sentence, playback chrome, gold-dot play, Emma voice, hairline panels on washi/fold) — same consistent styling as `frontend/`, not V4's timestamp table as the primary UI.
- **Bottom CTA = V4 closing obi**: "Bring one chapter. Read it tonight." + Try it out.
- **V3 beat section**: keep headline **"One sheet. One pull. Out loud."** and the flat-plane → creased-folds → speech idea; the old SVG "does not make sense." Replace with a Higgsfield plate at `plates/fold-speech.png` that makes the transformation legible, plus tiny mono labels (Flat plane / Creased folds / Speech) if needed. Image slot keeps the V3 diagram geometry.

## Live-app palette (authoritative — use these, not mock colors)

```
--washi: #f6eee2
--washi-deep: #efe4d4
--fold: #f8f4ea
--vermilion: #c34838
--vermilion-soft: #c3574b
--vermilion-ink: #9e3226
--sumi: #1a1513
--sumi-soft: #2a2420
--ink-fade: #6e645c
--ink-mute: #80756e
--gold: #c9a227
--gold-lit: #e8c55a
--hairline: #d6ccbc
--hairline-deep: #c9beb0
```

Texture: subtle washi paper (CSS fine grid/grain like V5, and/or `frontend/public/plates/washi-ground.png` copied to `landing/plates/washi-ground.png`).

## Fonts (Google)

- Display + body: **Shippori Mincho** (400/500/700)
- Mono marginalia / data: **Sometype Mono** (400..700)

## Product truth (do not invent)

- ori—to fold, yomi—to read
- Upload textbook chapter / notes / PDF → neural speech + sentence lit
- 9 Edge neural US English voices: Ava, Emma, Andrew, Brian, Aria, Jenny, Guy, Christopher, Michelle
- Speed 0.5×–2.0× live; .pdf/.docx/.md/.txt + paste; structure detection → folds; first fold plays while rest generate
- Optional Gemini quiz 1–8 questions (mention only if it fits; not a required section)
- Free, no accounts, no API key
- Sample: glycolysis excerpt; lit sentence "Glycolysis takes place in the cytoplasm."; voice Emma 1.0×; fold 02 of 04
- CTA label always **"Try it out"**, hero (obi) + end. href="#" placeholder.

## Craft floor (binding)

- No eyebrow/kicker above headings.
- Authored SVG icons only — never Unicode ✓ / emoji as icons.
- Contrast: body ≥4.5:1, large ≥3:1. Secondary text tinted from hue, never gray-on-color that fails.
- One authored motion moment (e.g. hanko stamp, obi wrap, or crease draw) — not scattered effects.
- Type at extremes: monumental Shippori display / tiny Sometype mono labels.
- Near-monochrome washi ground + single warm vermilion accent (+ gold only as the live app's play-dot / active fold mark).
- Browser surfaces themed (selection, focus, scrollbar, caret).
- No purple gradients, no glossy 3D blobs, no untextured stock photos, no icon-grid feature rows, no Inter-only type.
- No direction-contract prose in shipped HTML.
- Page must not ship direction-brief text; comments may note image placement.

## Output

Single self-contained `landing/index.html` (inline CSS, Google Fonts link). Images under `landing/plates/`. Hero and diagram slots sized so images drop in with zero layout change.
