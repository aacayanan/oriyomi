# Surface: Reader — frontend/src/app/page.tsx

Mode: Read. The learner reads along while audio plays.

Audience: learners and students with their own course documents. Job: absorb a document by ear and eye, then know whether they understood it. Action: play a passage, follow the highlighted sentence, optionally take the quiz. Proof/content: real document text, sentence-sync highlighting, section list with real audio minute counts. Constraints: free Edge TTS only, no accounts, quiz optional; sentence-sync never breaks.

Chosen direction: Paper-Fold Sequence (orizuru), adopted from a declined challenger card on the user's explicit pick (decision key c4c47a87, optionId challenger-orizuru). Memorable moment: the crease-pattern sheet folding section by section toward the finished crane as the document is read.

Approved comp: `.impeccable/mocks/comp-fold-desk.webp` — the three-zone desk (user-approved composition; earlier filename mapping was crossed at render time). Composition: fold-white top bar (crane mark, serif wordmark, small-caps READ/FOLDS/GUIDE/QUIZ nav, gold-dot PLAY right); washi-cream left rail with FOLD 02 OF 04, dot-row progress (second dot gold), current-fold crease card (02 · Glycolysis · 6:38), VOICE/TEMPO outline rows, mono timestamp strip; fold-white document sheet center with vermilion margin ticks, gold dot + vermilion crease underline on the active sentence; large vermilion kozo crease sheet right with CURRENT FOLD panel (02 · Glycolysis). Must not be literalized: crease/crane imagery becomes CSS/SVG progress driven by real playback state, not static pictures; photographic paper texture is direction material, approximated with subtle procedural texture at build.

Unresolved: exact mapping of fold count to sections (fold index = section index for now); kanji step-names do not appear on document content — section titles stay the document's own; quiz surface treatment inherits the world later.

## Direction contract

THESIS: Reading a document is folding one sheet — every section is a deliberate fold, the spoken sentence is the active crease, and completion stands as a crane. Refuses the category default of a neutral chrome player wrapped around a white text column.

OWN-WORLD: Washi-cream ground (#EDE3D1) with fold-white sheets (#F6F1E9); vermilion (#D83A2E) owns primary actions and the crease-pattern sheet; sumi black (#1A1A1A) carries text; exactly one gold dot (#D4AF37) marks the active state; ink-fade (#8E8A83) for meta. High-contrast serif display, quiet humanist sans body, small-caps letterspaced UI labels, zero-padded numbers in a strict margin column. Components: gold-dot primary button, hairline outline secondary, numbered content cards with crease-pattern thumbnails, dot-row progress, hairline rules — no shadows, no gradients, no glass.

STORY: The learner loads a document; it analyzes into numbered folds; they press the gold-dot play; the active sentence wears the dot and a vermilion crease underline; the sheet folds forward fold by fold; at the last fold the crane stands, and the optional quiz checks what stuck.

FIRST VIEWPORT: Desktop 16:9. Top: fold-white bar — vermilion crane mark plus Text Reader wordmark left, small-caps nav (READ · FOLDS · GUIDE · QUIZ), gold-dot PLAY right. Left rail on washi cream: FOLD 02 OF 04 with dot-row progress (active dot gold), current-fold card (02 · Glycolysis · 6:38) with crease thumbnail, VOICE and TEMPO fields in outline style. Center: fold-white document sheet, sumi body text; the active sentence carries a margin gold dot and a vermilion crease underline; finished earlier sections take small vermilion ticks. Right: square vermilion kozo sheet with fold-white creases, creased to current progress, CURRENT FOLD panel beneath. Bottom-left: monospace timestamp strip.

FORM: Paper-Fold Sequence (orizuru); challenger 3 of 6 in the dealt hand, adopted on user request; seed key a8c7d144.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
