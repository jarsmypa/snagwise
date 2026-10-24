// A price tag with its string hole: the same shape as the yellow deal sticker, drawn in line.
export function TagMark({ title }: { title?: string }) {
  return (
    <svg viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h9.6a2.5 2.5 0 0 1 1.77.73l10.4 10.4a2.5 2.5 0 0 1 0 3.54l-9.6 9.6a2.5 2.5 0 0 1-3.54 0L4.73 17.87A2.5 2.5 0 0 1 4 16.1Z"
        fill="#f5c518"
      />
      <circle cx="10.5" cy="10.5" r="2.4" fill="#1e5b43" />
      <path d="M13.5 19.5l6-6" stroke="#1a1915" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <h1 className="logo">
      <TagMark />
      Snagwise
    </h1>
  );
}
