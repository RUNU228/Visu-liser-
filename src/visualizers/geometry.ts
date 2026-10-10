import type {
  Channel,
  WaveBucket,
  SpectralFrame,
  Scale,
} from "../shared/types";
import { interpolate, frequencyAt } from "../analysis/dsp";
/** The display repeats bucket statistics over their measured interval; it adds no sample detail. */
export function projectWaveform(
  buckets: WaveBucket[],
  start: number,
  end: number,
  width: number,
  channel: Channel,
) {
  const mins = new Float32Array(width).fill(Infinity),
    maxs = new Float32Array(width).fill(-Infinity),
    energy = new Float64Array(width),
    counts = new Float64Array(width),
    gaps = new Set<number>(),
    bandEnergy = [
      new Float64Array(width),
      new Float64Array(width),
      new Float64Array(width),
    ],
    bandCounts = new Float64Array(width),
    bands = [
      new Float32Array(width),
      new Float32Array(width),
      new Float32Array(width),
    ];
  const step = (end - start) / width;
  for (const b of buckets) {
    if (b.end <= start || b.start >= end || b.end <= b.start) continue;
    const first = Math.max(0, Math.floor((b.start - start) / step)),
      last = Math.min(width - 1, Math.ceil((b.end - start) / step - 1e-10) - 1),
      stats = b.channels[channel];
    if (b.gap) gaps.add(first);
    for (let x = first; x <= last; x++) {
      const overlap = Math.max(
          0,
          Math.min(b.end, start + (x + 1) * step) -
            Math.max(b.start, start + x * step),
        ),
        fraction = overlap / (b.end - b.start);
      if (!fraction) continue;
      mins[x] = Math.min(mins[x], stats.min);
      maxs[x] = Math.max(maxs[x], stats.max);
      energy[x] += stats.sumSquares * fraction;
      counts[x] += stats.count * fraction;
      if (b.bands) {
        bandCounts[x] += stats.count * fraction;
        for (let k = 0; k < 3; k++)
          bandEnergy[k][x] += b.bands[channel][k] ** 2 * stats.count * fraction;
      }
    }
  }
  for (let x = 0; x < width; x++)
    if (bandCounts[x])
      for (let k = 0; k < 3; k++)
        bands[k][x] = Math.sqrt(bandEnergy[k][x] / bandCounts[x]);
  return { mins, maxs, energy, counts, gaps, bands };
}
export function historyPosition(
  time: number,
  now: number,
  duration: number,
  mode: "scroll" | "sweep",
) {
  return mode === "scroll"
    ? (time - now + duration) / duration
    : (((time % duration) + duration) % duration) / duration;
}
export function historyTime(
  u: number,
  now: number,
  duration: number,
  mode: "scroll" | "sweep",
) {
  if (mode === "scroll") return now - duration + u * duration;
  let time = Math.floor(now / duration) * duration + u * duration;
  if (time > now + 1e-10) time -= duration;
  return time;
}
/** Clip to captured visible history and split supports at a sweep wrap. */
export function historySpans(
  a: number,
  b: number,
  now: number,
  duration: number,
  mode: "scroll" | "sweep",
): number[][] {
  a = Math.max(a, now - duration);
  b = Math.min(b, now);
  if (b < a) return [];
  if (mode === "scroll")
    return [
      [
        historyPosition(a, now, duration, mode),
        historyPosition(b, now, duration, mode),
      ],
    ];
  const first = Math.floor(a / duration),
    last = Math.floor(b / duration),
    lo = historyPosition(a, now, duration, mode),
    hi = historyPosition(b, now, duration, mode);
  return first === last
    ? [[lo, hi]]
    : [
        [lo, 1],
        [0, hi],
      ];
}
/** Preserve every interior sample plus interpolated pixel-boundary amplitudes. */
export function scopeExtrema(values: Float32Array, width: number) {
  const mins = new Float32Array(width),
    maxs = new Float32Array(width);
  if (!values.length) return { mins, maxs };
  for (let x = 0; x < width; x++) {
    const a = (x / width) * (values.length - 1),
      b = ((x + 1) / width) * (values.length - 1);
    let min = Math.min(interpolate(values, a), interpolate(values, b)),
      max = Math.max(interpolate(values, a), interpolate(values, b));
    for (let i = Math.ceil(a); i <= Math.floor(b); i++) {
      min = Math.min(min, values[i]);
      max = Math.max(max, values[i]);
    }
    mins[x] = min;
    maxs[x] = max;
  }
  return { mins, maxs };
}
export function pointOpacity(age: number, window: number, tau: number) {
  if (age <= window) return 1;
  if (tau <= 0) return 0;
  const opacity = Math.exp(-(age - window) / tau);
  return opacity < 1 / 255 ? 0 : opacity;
}
/** One rendered frequency pixel, including its actual source-bin range. */
export function spectralPixel(
  frame: SpectralFrame,
  scale: Scale,
  maximum: number,
  pixel: number,
  width: number,
) {
  const spacing = frame.sampleRate / frame.fftSize,
    low = frequencyAt(pixel / width, 20, maximum, scale),
    high = frequencyAt((pixel + 1) / width, 20, maximum, scale),
    lo = low / spacing,
    hi = high / spacing,
    first = Math.max(1, Math.ceil(lo)),
    last = Math.min(frame.powers.length - 1, Math.floor(hi));
  let power = 0,
    peak = -160;
  if (first <= last) {
    for (let k = first; k <= last; k++) {
      power = Math.max(power, frame.powers[k]);
      peak = Math.max(peak, frame.peakDb?.[k] ?? -160);
    }
    return {
      power,
      peak,
      low: Math.max(0, (first - 0.5) * spacing),
      high: Math.min(frame.sampleRate / 2, (last + 0.5) * spacing),
      frequency: Math.sqrt(low * high),
      interpolated: false,
    };
  }
  const center = (lo + hi) / 2,
    k = Math.floor(center),
    fraction = center - k;
  power =
    (frame.powers[k] ?? 0) * (1 - fraction) +
    (frame.powers[k + 1] ?? 0) * fraction;
  peak =
    (frame.peakDb?.[k] ?? -160) * (1 - fraction) +
    (frame.peakDb?.[k + 1] ?? -160) * fraction;
  return {
    power,
    peak,
    low: k * spacing,
    high: (k + 1) * spacing,
    frequency: Math.sqrt(low * high),
    interpolated: true,
  };
}
