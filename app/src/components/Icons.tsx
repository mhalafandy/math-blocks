/** Toolbar icons: 16 px, drawn with the text colour, in the style of the panel icons. */

/** Settings: a gear (six teeth around a ring). */
export function GearIcon() {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      {teeth.map((a) => (
        <rect key={a} x="7" y="1.2" width="2" height="2.6" rx="0.5" fill="currentColor" stroke="none" transform={`rotate(${a} 8 8)`} />
      ))}
      <circle cx="8" cy="8" r="4.6" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}

/** The Word preview: a page with a line of math and the line-width guide. */
export function PreviewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M4 8h5.5" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11.5 5v6" strokeDasharray="1.2 1.2" />
    </svg>
  );
}
