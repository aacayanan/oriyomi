import Link from "next/link";
import type { Metadata } from "next";
import ReaderMock from "@/components/LandingReaderMock";
import "./landing.css";

export const metadata: Metadata = {
  title: "oriyomi — fold a chapter into speech",
  description:
    "ori—to fold, yomi—to read. Oriyomi folds a document into neural speech and lights the exact sentence being spoken. Free, no account, no API key.",
};

export default function LandingPage() {
  return (
    <div className="landing-page">
      {/* registration crosses + folio marginalia */}
      <svg className="reg reg-tl" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth=".8" />
      </svg>
      <svg className="reg reg-tr" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth=".8" />
      </svg>
      <svg className="reg reg-bl" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth=".8" />
      </svg>
      <svg className="reg reg-br" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth=".8" />
      </svg>
      <span className="folio folio-l" aria-hidden="true">
        VOL. 01 · SHEET 01/01
      </span>
      <span className="folio folio-r" aria-hidden="true">
        SENTENCE-SYNC READ-ALONG
      </span>

      {/* Masthead */}
      <header className="landing-masthead">
        <svg className="landing-mark" viewBox="0 0 64 64" aria-hidden="true">
          <path
            d="M2 30 L20 17 L32 5 L44 17 L62 30 L44 31 L32 45 L20 31 Z M27 31 L32 60 L37 31 Z"
            fill="currentColor"
          />
        </svg>
        <span className="wordmark">oriyomi</span>
        <div className="landing-issue">
          <span className="landing-issue-label">Vol. 01 · Free Forever</span>
          <span className="landing-issue-sub">
            Sentence-sync read-along · edition of one
          </span>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="cover" aria-labelledby="title-h">
          <div className="seal" aria-hidden="true">
            折
          </div>

          <div className="cover-grid">
            <div>
              <h1 className="landing-title" id="title-h">
                Fold a chapter into speech.
              </h1>

              <p className="lede">
                Upload a textbook chapter, notes or a PDF. It comes back as
                natural neural speech with{" "}
                <b>the exact sentence being spoken lit on the page</b> — so your
                eyes and your ears stay on the same line, from the first fold to
                the last.
              </p>

              <p className="etym">
                <span className="etym-pair">
                  <span className="etym-kanji">折り</span>
                  <span className="landing-mono">ori — to fold</span>
                </span>
                <span className="etym-pair">
                  <span className="etym-kanji">読み</span>
                  <span className="landing-mono">yomi — to read</span>
                </span>
              </p>

              <ul className="cover-meta">
                <li>
                  <span className="landing-mono">Input</span>
                  <span className="cover-meta-v">
                    .pdf · .docx · .md · .txt · paste
                  </span>
                </li>
                <li>
                  <span className="landing-mono">Voices</span>
                  <span className="cover-meta-v">
                    9 · edge neural · us english
                  </span>
                </li>
                <li>
                  <span className="landing-mono">Speed</span>
                  <span className="cover-meta-v">0.5× – 2.0× · applied live</span>
                </li>
                <li>
                  <span className="landing-mono">Account</span>
                  <span className="cover-meta-v">No account needed</span>
                </li>
              </ul>
            </div>

            <div className="plate-wrap">
              <figure
                className="plate"
                role="img"
                aria-label="Paper crane plate, transparent ground, angled on a 3D plane."
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/plates/crane.png"
                  alt="Red paper crane, transparent background."
                />
              </figure>
              <div className="plate-cap">
                <span className="landing-mono">
                  fig. · transparent plate · 3:4
                </span>
                <span className="landing-mono">
                  img-crane · red crane · 2048px
                </span>
              </div>
            </div>
          </div>

          {/* Obi red bar CTA */}
          <div className="obi">
            <div>
              <p className="say">
                Bring the chapter you keep postponing. Press play, and read
                along.
              </p>
              <p className="fine landing-mono landing-mono-on-verm">
                free · no account · no api key
              </p>
            </div>
            <div className="cta-slot">
              <Link className="landing-cta" href="/app">
                <svg viewBox="0 0 12 14" aria-hidden="true">
                  <path d="M0 0 L12 7 L0 14 Z" fill="currentColor" />
                </svg>
                Try it out
              </Link>
            </div>
          </div>
        </section>

        {/* Beat section */}
        <section className="beat" aria-labelledby="beat-h">
          <div className="beat-grid">
            <div>
              <h2 id="beat-h">One sheet. One pull. Out loud.</h2>
              <p>
                A dense chapter arrives as one flat, overwhelming page. Oriyomi
                creases it into folds — the sections it already has — and each
                fold becomes clean speech you can follow. The fold you are on is
                the fold being spoken.
              </p>
            </div>

            <div>
              <figure
                className="diagram-plate"
                role="img"
                aria-label="Diagram: a flat sheet creases into folds and opens into speech; arrows point right."
              >
                <div className="diagram-inner">
                  <div className="diagram-step">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/plates/paper-stack.png"
                      alt="One flat sheet of paper."
                    />
                    <span className="landing-mono">one sheet</span>
                  </div>

                  {/* SVG arrow pointing RIGHT — identical on both gaps */}
                  <svg
                    className="diagram-arrow"
                    viewBox="0 0 40 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 12h30"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M26 6l8 6-8 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  <div className="diagram-step is-pull">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/plates/paper-fold2.png"
                      alt="Paper accordion folds."
                    />
                    <span className="landing-mono">one pull</span>
                  </div>

                  {/* SVG arrow pointing RIGHT — identical on both gaps */}
                  <svg
                    className="diagram-arrow"
                    viewBox="0 0 40 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 12h30"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M26 6l8 6-8 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  <div className="diagram-step">
                    {/* Speech icon: bubble + triangle joined, waves opening right */}
                    <svg
                      className="diagram-speech"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <rect
                        x="4"
                        y="16"
                        width="20"
                        height="16"
                        rx="2"
                        fill="#c34838"
                      />
                      {/* triangle overlaps the bubble — no gap */}
                      <polygon points="20,20 20,28 28,24" fill="#c34838" />
                      <path
                        d="M34 18c3 3.5 3 8.5 0 12"
                        stroke="#c34838"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <path
                        d="M39 13c5.5 6 5.5 16 0 22"
                        stroke="#c34838"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                    <span className="landing-mono">out loud</span>
                  </div>
                </div>
              </figure>
            </div>
          </div>
        </section>

        {/* Book section / flaps */}
        <section className="flaps" aria-label="What oriyomi is, and how it reads">
          <div className="flap flap-left">
            <h2>Yomi means to read.</h2>
            <p>
              A dense chapter is a flat, overwhelming sheet. The hard part is not
              reading it — it is starting, staying oriented inside it, and knowing
              afterwards whether any of it stuck.
            </p>
            <p>
              Oriyomi creases the sheet. Structure detection finds the chapters
              and sections and turns them into folds; each fold is spoken by a
              neural voice you can follow by ear and by eye. First fold plays
              while the rest are still generating.
            </p>

            <div className="colophon">
              <div className="colophon-row">
                <span className="landing-mono">折り ori</span>
                <span>to fold — sections become folds you can take one at a time</span>
              </div>
              <div className="colophon-row">
                <span className="landing-mono">読み yomi</span>
                <span>to read — every spoken sentence stays lit on the page</span>
              </div>
              <div className="colophon-row">
                <span className="landing-mono">Sync</span>
                <span>sentence-level timestamps, applied at any speed</span>
              </div>
              <div className="colophon-row">
                <span className="landing-mono">Cost</span>
                <span>free — no account, no subscription, no API key</span>
              </div>
            </div>
          </div>

          <div className="flap flap-right">
            <h2>The lit sentence is the spoken sentence.</h2>
            <p>
              Not paragraph scrolling. Not a moving highlight you have to chase.
              The line being read to you is the line wearing the mark.
            </p>

            {/* Reader mock */}
            <ReaderMock />
          </div>
        </section>

        {/* Closing CTA */}
        <section className="close" aria-label="Start reading">
          <div className="obi">
            <h2>Bring one chapter. Read it tonight.</h2>
            <div className="cta-slot">
              <Link className="landing-cta" href="/app">
                <svg viewBox="0 0 12 14" aria-hidden="true">
                  <path d="M0 0 L12 7 L0 14 Z" fill="currentColor" />
                </svg>
                Try it out
              </Link>
              <p className="fine landing-mono landing-mono-on-verm">
                free · no account · no api key
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-mono">
          oriyomi · 折り to fold · 読み to read
        </span>
        <span className="landing-mono">
          sentence-sync read-along · 9 edge neural voices
        </span>
        <span className="landing-mono">vol. 01 · edition of one</span>
        <svg className="landing-mark" viewBox="0 0 64 64" aria-hidden="true">
          <path
            d="M2 30 L20 17 L32 5 L44 17 L62 30 L44 31 L32 45 L20 31 Z M27 31 L32 60 L37 31 Z"
            fill="currentColor"
          />
        </svg>
      </footer>
    </div>
  );
}