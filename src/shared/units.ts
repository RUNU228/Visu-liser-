export const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
export function timeLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
export function frequencyLabel(hz: number) {
  return hz >= 1000 ? `${+(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
}
export function frequencyPosition(
  hz: number,
  min: number,
  max: number,
  scale: "linear" | "log" | "mel",
) {
  if (scale === "linear") return (hz - min) / (max - min);
  const mel = (f: number) => 2595 * Math.log10(1 + f / 700);
  return scale === "mel"
    ? (mel(hz) - mel(min)) / (mel(max) - mel(min))
    : Math.log(hz / min) / Math.log(max / min);
}
export function positionFrequency(
  x: number,
  min: number,
  max: number,
  scale: "linear" | "log" | "mel",
) {
  if (scale === "linear") return min + x * (max - min);
  if (scale === "log") return min * (max / min) ** x;
  const mel = (f: number) => 2595 * Math.log10(1 + f / 700);
  return 700 * (10 ** ((mel(min) + x * (mel(max) - mel(min))) / 2595) - 1);
}
export function spectralDb(code: number) {
  return code === 0 ? -160 : -160 + ((code - 1) / 65534) * 320;
}
export function levelDb(power: number) {
  return power > 0 ? 10 * Math.log10(power) : -160;
}
export function noteLabel(hz: number) {
  if (hz <= 0) return "";
  const midi = 69 + 12 * Math.log2(hz / 440),
    nearest = Math.round(midi);
  const names = [
    "C",
    "C♯",
    "D",
    "D♯",
    "E",
    "F",
    "F♯",
    "G",
    "G♯",
    "A",
    "A♯",
    "B",
  ];
  return `${names[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1} ${Math.round((midi - nearest) * 100) >= 0 ? "+" : ""}${Math.round((midi - nearest) * 100)} cents`;
}
