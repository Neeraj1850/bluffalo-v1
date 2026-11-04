import type { PresetKey } from "@/lib/data/strategy";

/** One abstract mark per personality: block, fin, zigzag, dashed square. */
export function PresetGlyph({ preset }: { preset: PresetKey }) {
  switch (preset) {
    case "rock":
      return (
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
          <rect x="20" y="62" width="100" height="58" fill="currentColor" />
          <rect x="38" y="24" width="64" height="38" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "shark":
      return (
        <svg width="150" height="140" viewBox="0 0 150 140" aria-hidden="true">
          <path d="M10 118 L96 10 L104 118 Z" fill="currentColor" />
          <path d="M0 128 H150" stroke="currentColor" strokeWidth="2" />
          <path d="M20 136 H130" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" />
        </svg>
      );
    case "maniac":
      return (
        <svg width="150" height="140" viewBox="0 0 150 140" aria-hidden="true">
          <path
            d="M6 110 L30 20 L52 96 L74 14 L96 104 L118 28 L144 118"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinejoin="bevel"
          />
        </svg>
      );
    case "custom":
      return (
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
          <rect
            x="14"
            y="14"
            width="112"
            height="112"
            rx="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="8 8"
          />
          <path d="M40 70h60M70 40v60" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
}
