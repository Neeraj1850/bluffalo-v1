export type NavKey = "lobby" | "strategy" | "market" | "live" | "history" | "profile" | "wallet";

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
      {name === "lobby" && (
        <>
          <rect x="3" y="3" width="6" height="6" />
          <rect x="11" y="3" width="6" height="6" />
          <rect x="3" y="11" width="6" height="6" />
          <rect x="11" y="11" width="6" height="6" />
        </>
      )}
      {name === "strategy" && (
        <>
          <path d="M3 5h14M3 10h14M3 15h14" />
          <rect x="5" y="3" width="3" height="4" fill="currentColor" />
          <rect x="11" y="8" width="3" height="4" fill="currentColor" />
          <rect x="7" y="13" width="3" height="4" fill="currentColor" />
        </>
      )}
      {name === "market" && (
        <>
          <path d="M3 15l4-5 3 3 7-8" />
          <path d="M13 5h4v4" />
        </>
      )}
      {name === "live" && (
        <>
          <circle cx="10" cy="10" r="7" />
          <circle cx="10" cy="10" r="2.5" fill="currentColor" />
        </>
      )}
      {name === "history" && (
        <>
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4l3 2" />
        </>
      )}
      {name === "profile" && (
        <>
          <circle cx="10" cy="7" r="3.5" />
          <path d="M3.5 17c1-3.5 3.6-5 6.5-5s5.5 1.5 6.5 5" />
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
