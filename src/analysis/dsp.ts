import type {
  Channel,
  Scale,
  SpectralChannel,
  Stats,
  WindowKind,
} from "../shared/types";
export const channelValue = (l: number, r: number, ch: Channel): number =>
  ch === "L" ? l : ch === "R" ? r : ch === "M" ? (l + r) / 2 : (l - r) / 2;
/** Raw pre-adjustment dB; zero has no finite level. */
export const powerDb = (p: number): number =>
  p > 0 ? 10 * Math.log10(p) : -Infinity;
export const encodeDb = (v: number): number =>
  v < -160 || Number.isNaN(v)
    ? 0
    : 1 + Math.round(((Math.min(160, v) + 160) * 65534) / 320);
/** Code 0 is ≤−160 and 65535 ≥+160; never label those as exact. */
export const decodeDb = (v: number): number =>
  v === 0 ? -160 : -160 + ((v - 1) * 320) / 65534;
export function combineStats(a: Stats, b: Stats): Stats {
  return {
    min: Math.min(a.min, b.min),
    max: Math.max(a.max, b.max),
    sumSquares: a.sumSquares + b.sumSquares,
    count: a.count + b.count,
  };
}
const map = (f: number, s: Scale) =>
  s === "linear"
    ? f
    : s === "mel"
      ? 2595 * Math.log10(1 + f / 700)
      : Math.log(f);
export const frequencyPosition = (
  f: number,
  min: number,
  max: number,
  s: Scale,
): number => (map(f, s) - map(min, s)) / (map(max, s) - map(min, s));
export function frequencyAt(
  u: number,
  min: number,
  max: number,
  s: Scale,
): number {
  const v = map(min, s) + u * (map(max, s) - map(min, s));
  return s === "linear"
    ? v
    : s === "mel"
      ? 700 * (10 ** (v / 2595) - 1)
      : Math.exp(v);
}
/** In-place unnormalized radix-2 FFT; inverse divides by N. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n < 2 || (n & (n - 1)) !== 0 || im.length !== n)
    throw new RangeError("FFT needs power-of-two arrays");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size,
      wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let cr = 1,
        ci = 0;
      for (let j = 0; j < size / 2; j++) {
        const a = start + j,
          b = a + size / 2,
          tr = cr * re[b] - ci * im[b],
          ti = cr * im[b] + ci * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
}
export interface SpectralOptions {
  fftSize: number;
  window: WindowKind;
  channel: SpectralChannel;
}
/** Owns reusable FFT scratch, returns independent power arrays. */
export class SpectralPlan {
  private w: Float64Array;
  private re: Float64Array;
  private im: Float64Array;
  private sum = 0;
  constructor(readonly options: SpectralOptions) {
    const n = options.fftSize;
    this.w = new Float64Array(n);
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = (2 * Math.PI * i) / n,
        v =
          options.window === "hann"
            ? 0.5 - 0.5 * Math.cos(p)
            : 0.42 - 0.5 * Math.cos(p) + 0.08 * Math.cos(2 * p);
      this.w[i] = v;
      this.sum += v;
    }
  }
  calculate(l: Float32Array, r: Float32Array): Float32Array {
    const n = this.options.fftSize,
      ch = this.options.channel;
    if (l.length < n || r.length < n)
      throw new RangeError("Incomplete FFT window");
    const out = new Float32Array(n / 2 + 1);
    for (let pass = 0; pass < (ch === "stereo" ? 2 : 1); pass++) {
      this.im.fill(0);
      for (let i = 0; i < n; i++)
        this.re[i] =
          (ch === "stereo"
            ? pass
              ? r[i]
              : l[i]
            : channelValue(l[i], r[i], ch)) * this.w[i];
      fft(this.re, this.im);
      for (let k = 0; k <= n / 2; k++) {
        const f = (k === 0 || k === n / 2 ? 1 : 2) / this.sum;
        out[k] +=
          ((this.re[k] ** 2 + this.im[k] ** 2) * f * f) /
          (ch === "stereo" ? 2 : 1);
      }
    }
    return out;
  }
}
export const spectralPower = (
  l: Float32Array,
  r: Float32Array,
  o: SpectralOptions,
): Float32Array => new SpectralPlan(o).calculate(l, r);
export function smoothPower(
  previous: Float32Array,
  current: Float32Array,
  percentage: number,
  dt: number,
): Float32Array {
  const a =
    percentage === 0
      ? 0
      : Math.max(0, Math.min(0.999999, percentage / 100)) **
        (Math.max(0, dt) * 60);
  return Float32Array.from(
    current,
    (v, i) => a * (previous[i] ?? 0) + (1 - a) * v,
  );
}
/** Fixed logarithmic storage buckets with maximum power or identified interpolation. */
export function aggregateFrequency(
  input: Float32Array,
  rate: number,
  n: number,
  buckets = 1024,
) {
  const max = Math.min(20000, rate / 2),
    min = Math.min(20, max / 2),
    spacing = rate / n;
  const edges = Float32Array.from({ length: buckets + 1 }, (_, i) =>
      frequencyAt(i / buckets, min, max, "log"),
    ),
    powers = new Float32Array(buckets),
    interpolated = new Uint8Array(buckets);
  for (let i = 0; i < buckets; i++) {
    const lo = Math.ceil(edges[i] / spacing),
      hi = Math.min(input.length - 1, Math.floor(edges[i + 1] / spacing));
    if (lo <= hi) {
      for (let k = lo; k <= hi; k++) powers[i] = Math.max(powers[i], input[k]);
    } else {
      const bin = Math.sqrt(edges[i] * edges[i + 1]) / spacing,
        k = Math.floor(bin),
        f = bin - k;
      powers[i] = (input[k] ?? 0) * (1 - f) + (input[k + 1] ?? 0) * f;
      interpolated[i] = 1;
    }
  }
  return { edges, powers, interpolated };
}
export function correlation(l: Float32Array, r: Float32Array): number | null {
  const n = Math.min(l.length, r.length);
  if (!n) return null;
  let ll = 0,
    rr = 0,
    lr = 0;
  for (let i = 0; i < n; i++) {
    ll += l[i] ** 2;
    rr += r[i] ** 2;
    lr += l[i] * r[i];
  }
  return ll / n < 1e-10 || rr / n < 1e-10
    ? null
    : Math.max(-1, Math.min(1, lr / Math.sqrt(ll * rr)));
}
/** Deterministic paired extrema plus time-distributed samples, capped per 1ms. */
export function selectStereoPairs(
  l: Float32Array,
  r: Float32Array,
  rate: number,
  firstFrame: number,
  budget = 24,
): number[] {
  const out: number[] = [];
  let start = 0;
  while (start < l.length) {
    const bucket = Math.floor(((firstFrame + start) * 1000) / rate);
    let end = start + 1;
    while (
      end < l.length &&
      Math.floor(((firstFrame + end) * 1000) / rate) === bucket
    )
      end++;
    const indices = new Set<number>();
    for (const ch of ["L", "R", "M", "S"] as const) {
      let min = start,
        max = start;
      for (let i = start + 1; i < end; i++) {
        const v = channelValue(l[i], r[i], ch);
        if (v < channelValue(l[min], r[min], ch)) min = i;
        if (v > channelValue(l[max], r[max], ch)) max = i;
      }
      indices.add(min);
      indices.add(max);
    }
    const remaining = Math.max(0, budget - indices.size);
    for (let j = 0; j < remaining; j++)
      indices.add(
        start +
          Math.floor(((j + 0.5) * (end - start)) / Math.max(1, remaining)),
      );
    for (
      let i = start;
      indices.size < Math.min(budget, end - start) && i < end;
      i++
    )
      indices.add(i);
    out.push(
      ...Array.from(indices)
        .sort((a, b) => a - b)
        .slice(0, budget),
    );
    start = end;
  }
  return out;
}
class Biquad {
  private z1 = 0;
  private z2 = 0;
  private b0: number;
  private b1: number;
  private b2: number;
  private a1: number;
  private a2: number;
  constructor(rate: number, f: number, high: boolean) {
    const w = (2 * Math.PI * Math.min(f, rate * 0.49)) / rate,
      c = Math.cos(w),
      alpha = Math.sin(w) / Math.SQRT2,
      a0 = 1 + alpha;
    this.b0 = (high ? 1 + c : 1 - c) / 2 / a0;
    this.b1 = (high ? -(1 + c) : 1 - c) / a0;
    this.b2 = this.b0;
    this.a1 = (-2 * c) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  process(x: number) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  reset() {
    this.z1 = 0;
    this.z2 = 0;
  }
}
/** Fourth-order Linkwitz-Riley supplementary bands. */
export class BandSplitter {
  private f: Biquad[];
  constructor(rate: number) {
    this.f = [
      new Biquad(rate, 200, false),
      new Biquad(rate, 200, false),
      new Biquad(rate, 200, true),
      new Biquad(rate, 200, true),
      new Biquad(rate, 2000, false),
      new Biquad(rate, 2000, false),
      new Biquad(rate, 2000, true),
      new Biquad(rate, 2000, true),
    ];
  }
  process(x: number): [number, number, number] {
    const f = this.f,
      low = f[1].process(f[0].process(x)),
      above = f[3].process(f[2].process(x));
    return [
      low,
      f[5].process(f[4].process(above)),
      f[7].process(f[6].process(x)),
    ];
  }
  reset() {
    for (const f of this.f) f.reset();
  }
}
/** YIN CMND, equal comparison span for all lags. FFT convolution accelerates differences. */
export class YinDetector {
  readonly length: number;
  private max: number;
  private min: number;
  private size: number;
  private a: Float64Array;
  private ai: Float64Array;
  private b: Float64Array;
  private bi: Float64Array;
  private cmnd: Float64Array;
  constructor(private rate: number) {
    this.length = Math.ceil((4096 * rate) / 48000);
    this.max = Math.floor(rate / 40);
    this.min = Math.max(2, Math.floor(rate / 2000));
    this.size = 2 ** Math.ceil(Math.log2(this.length * 2));
    this.a = new Float64Array(this.size);
    this.ai = new Float64Array(this.size);
    this.b = new Float64Array(this.size);
    this.bi = new Float64Array(this.size);
    this.cmnd = new Float64Array(this.max + 1);
  }
  detect(samples: Float32Array): {
    frequency: number | null;
    confidence: number;
  } {
    const n = this.length,
      max = this.max,
      span = n - max;
    if (samples.length < n || span < 1)
      return { frequency: null, confidence: 0 };
    const offset = samples.length - n;
    let rms = 0;
    for (let i = 0; i < n; i++) rms += samples[offset + i] ** 2;
    if (rms / n <= 1e-6) return { frequency: null, confidence: 0 };
    this.a.fill(0);
    this.ai.fill(0);
    this.b.fill(0);
    this.bi.fill(0);
    let base = 0;
    for (let i = 0; i < n; i++) {
      this.a[i] = samples[offset + i];
      if (i < span) {
        this.b[span - 1 - i] = samples[offset + i];
        base += samples[offset + i] ** 2;
      }
    }
    fft(this.a, this.ai);
    fft(this.b, this.bi);
    for (let i = 0; i < this.size; i++) {
      const ar = this.a[i],
        av = this.ai[i];
      this.a[i] = ar * this.b[i] - av * this.bi[i];
      this.ai[i] = ar * this.bi[i] + av * this.b[i];
    }
    fft(this.a, this.ai, true);
    let shifted = base,
      sum = 0;
    this.cmnd[0] = 1;
    for (let lag = 1; lag <= max; lag++) {
      shifted +=
        samples[offset + span + lag - 1] ** 2 - samples[offset + lag - 1] ** 2;
      const d = Math.max(0, base + shifted - 2 * this.a[span - 1 + lag]);
      sum += d;
      this.cmnd[lag] = sum > 0 ? (d * lag) / sum : 1;
    }
    for (let lag = this.min; lag <= max; lag++) {
      if (this.cmnd[lag] > 0.2) continue;
      while (lag < max && this.cmnd[lag + 1] < this.cmnd[lag]) lag++;
      const a = this.cmnd[lag - 1],
        b = this.cmnd[lag],
        c = lag < max ? this.cmnd[lag + 1] : b,
        den = a - 2 * b + c,
        ref = lag < max && den !== 0 ? (0.5 * (a - c)) / den : 0,
        f = this.rate / (lag + Math.max(-0.5, Math.min(0.5, ref))),
        confidence = Math.max(0, Math.min(1, 1 - b));
      return f >= 39.6 && f <= 2020 && confidence >= 0.8
        ? { frequency: Math.max(40, Math.min(2000, f)), confidence }
        : { frequency: null, confidence };
    }
    return { frequency: null, confidence: 0 };
  }
}
export function interpolate(samples: Float32Array, position: number): number {
  const i = Math.floor(position),
    f = position - i;
  return (
    samples[i] * (1 - f) +
    (samples[Math.min(samples.length - 1, i + 1)] ?? samples[i]) * f
  );
}
/** Duration in frames may be fractional. Output includes interpolated endpoints. */
export function triggerWindow(
  samples: Float32Array,
  rate: number,
  durationFrames: number,
  trigger: "off" | "rising" | "falling",
  level: number,
  predicted?: number,
) {
  const lastStart = samples.length - 1 - durationFrames;
  if (lastStart < 0)
    return {
      values: new Float32Array(),
      locked: false,
      preparing: true,
      start: 0,
    };
  let start = lastStart,
    locked = false;
  if (trigger !== "off") {
    const low = Math.max(0, lastStart - rate * 0.1),
      candidates: number[] = [];
    let armed = false;
    for (
      let i = Math.max(0, Math.floor(low) - Math.ceil(rate * 0.1));
      i <= Math.floor(lastStart);
      i++
    ) {
      const a = samples[i],
        b = samples[i + 1];
      if (trigger === "rising" ? a <= level - 0.01 : a >= level + 0.01)
        armed = true;
      if (
        armed &&
        (trigger === "rising"
          ? a <= level && b > level
          : a >= level && b < level)
      ) {
        const p = i + (level - a) / (b - a);
        if (p >= low && p <= lastStart) candidates.push(p);
        armed = false;
      }
    }
    if (candidates.length) {
      start =
        predicted === undefined
          ? candidates[candidates.length - 1]
          : candidates.reduce((a, b) =>
              Math.abs(a - predicted) < Math.abs(b - predicted) ? a : b,
            );
      locked = true;
    }
  }
  const segments = Math.max(1, Math.ceil(durationFrames));
  return {
    values: Float32Array.from({ length: segments + 1 }, (_, i) =>
      interpolate(samples, start + (durationFrames * i) / segments),
    ),
    locked,
    preparing: false,
    start,
  };
}
