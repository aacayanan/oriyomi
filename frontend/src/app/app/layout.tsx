export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen overflow-hidden">
      {/* Mobile gate — the reader is a desktop desk; phones get the notice. */}
      <div className="app-mobile-gate">
        <svg className="gate-mark" viewBox="0 0 64 64" aria-hidden="true">
          <path
            d="M2 30 L20 17 L32 5 L44 17 L62 30 L44 31 L32 45 L20 31 Z M27 31 L32 60 L37 31 Z"
            fill="currentColor"
          />
        </svg>
        <span className="gate-wordmark">oriyomi</span>
        <span className="gate-rule" aria-hidden="true" />
        <p className="gate-copy">
          oriyomi works best on desktop devices, mobile is not supported yet
        </p>
        <p className="gate-fine">折り to fold · 読み to read</p>
      </div>
      <div className="app-desktop-only h-full">{children}</div>
    </div>
  );
}
