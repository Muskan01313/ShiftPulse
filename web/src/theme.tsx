/** The stopwatch-with-tick logo, drawn in the app's colours. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--gold-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--gold-b)" }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-g)" />
      <g style={{ fill: "var(--accent-fg)", stroke: "var(--accent-fg)" }}>
        <rect x="27" y="7" width="10" height="6" rx="2" stroke="none" />
        <rect x="44" y="14" width="7" height="5" rx="2" stroke="none" transform="rotate(45 47.5 16.5)" />
        <circle cx="32" cy="36" r="17" fill="none" strokeWidth="5" />
        <path d="M24 36l6 6 11-12" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
