import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  play: "M8 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  prev: "M6 5v14M18 5L8 12l10 7z",
  next: "M18 5v14M6 5l10 7-10 7z",
  plus: "M12 5v14M5 12h14",
  settings: "M5 7h14M5 17h14M9 4v6M15 14v6",
  close: "m6 6 12 12M18 6 6 18",
  expand: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  queue: "M5 6h14M5 12h14M5 18h14",
  volume: "M4 9h4l5-4v14l-5-4H4zM16 8c3 2 3 6 0 8M19 5c5 4 5 10 0 14",
  mute: "M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6",
  sun: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0",
  moon: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z",
  repeat: "M17 3l4 4-4 4M3 10V7h18M7 21l-4-4 4-4M21 14v3H3",
  shuffle: "M3 5h3l12 14h3M17 15l4 4-4 4M3 19h3l5-6M14 9l4-4h3M17 1l4 4-4 4",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  drag: "M8 5h1M15 5h1M8 12h1M15 12h1M8 19h1M15 19h1",
  freeze: "M9 4v16M15 4v16",
  back: "M20 12H4m6-6-6 6 6 6",
  upload: "M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4",
};
export function Icon({ name, style }: { name: string; style?: CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d={paths[name] ?? paths.settings} />
    </svg>
  );
}
export function Logo() {
  return (
    <svg
      className="logo"
      role="img"
      aria-label="Visu@lizer"
      viewBox="0 0 240 50"
    >
      <text
        x="0"
        y="36"
        fill="currentColor"
        fontFamily="Inter Variable, sans-serif"
        fontSize="34"
        fontWeight="650"
        letterSpacing="-1.8"
      >
        Visu<tspan fontWeight="400">@</tspan>lizer
      </text>
      <path
        d="M76 39h19"
        stroke="currentColor"
        strokeWidth="1"
        transform="translate(2,0)"
      />
    </svg>
  );
}
