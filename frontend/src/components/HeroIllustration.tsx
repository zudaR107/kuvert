// A flat-vector envelope, in the same construction style as schloss's own
// castle illustration (flat filled shapes, no strokes, one light recess
// tone, one small signature accent mark borrowed from a sibling app's
// color rather than this app's own accent) - part of the same visual
// family, different subject and color.
export function HeroIllustration({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size * (100 / 140)}
      viewBox="0 0 140 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Kuvert"
      className={className}
    >
      {/* Body */}
      <rect x="10" y="20" width="120" height="70" rx="4" fill="#0d9488" />

      {/* Letter, peeking out above the closed flap */}
      <rect x="55" y="8" width="30" height="18" fill="#ccfbf1" />

      {/* Flap (closed) - the darker tone, same "roof over body" trick as
          the castle's darker roof triangles - plays a brief opening
          animation on mount (see index.css's envelope-flap-open). */}
      <path className="envelope-flap" d="M10 20 L130 20 L70 55 Z" fill="#0b7d73" />

      {/* Signature stamp - schloss's own violet, a small cross-service
          wink tying the illustration family together. */}
      <rect x="100" y="65" width="16" height="14" rx="1.5" fill="#863bff" />
    </svg>
  )
}
