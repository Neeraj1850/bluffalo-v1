export type NavKey = "strategy" | "practice" | "live" | "wallet";

/** 20px stroke icons for the main navigation. */
export function NavIcon({ name }: { name: NavKey }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {name === "strategy" && (
        <>
          <path d="M3 5h14M3 10h14M3 15h14" />
          <rect x="5" y="3" width="3" height="4" fill="currentColor" />
          <rect x="11" y="8" width="3" height="4" fill="currentColor" />
          <rect x="7" y="13" width="3" height="4" fill="currentColor" />
        </>
      )}
      {name === "live" && (
        <>
          <circle cx="10" cy="10" r="7" />
          <circle cx="10" cy="10" r="2.5" fill="currentColor" />
        </>
      )}
      {name === "practice" && (
        <>
          <circle cx="10" cy="10" r="7" strokeDasharray="2.5 2" />
          <path d="M8.5 7v6l4.5-3z" fill="currentColor" />
        </>
      )}
      {name === "wallet" && (
        <>
          <rect x="3" y="5" width="14" height="11" rx="2" />
          <path d="M13 10.5h2" />
        </>
      )}
    </svg>
  );
}
