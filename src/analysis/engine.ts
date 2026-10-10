import type {
  AnalysisConfig,
  AnalysisResult,
  Channel,
  ModuleId,
  PCMPacket,
  ScopeFrame,
  SpectralFrame,
  SpectralSlice,
  Stats,
  StereoPoints,
  WaveBucket,
  WorkerInput,
  WorkerOutput,
} from "../shared/types";
import {
  BandSplitter,
  YinDetector,
  SpectralPlan,
  aggregateFrequency,
  channelValue,
  correlation,
  encodeDb,
  powerDb,
  selectStereoPairs,
  smoothPower,
  triggerWindow,
  type SpectralOptions,
} from "./dsp";
const CHANNELS: Channel[] = ["L", "R", "M", "S"];
const emptyStats = (): Stats => ({
  min: Infinity,
  max: -Infinity,
  sumSquares: 0,
  count: 0,
});
const sameSpectrum = (a: SpectralOptions, b: SpectralOptions) =>
  a.fftSize === b.fftSize && a.window === b.window && a.channel === b.channel;
class STFT {
  private l: Float32Array;
  private r: Float32Array;
  private orderedL: Float32Array;
  private orderedR: Float32Array;
  private cursor = 0;
  private count = 0;
  private until = 0;
  private plan: SpectralPlan;
  constructor(readonly options: SpectralOptions) {
    this.l = new Float32Array(options.fftSize);
    this.r = new Float32Array(options.fftSize);
    this.orderedL = new Float32Array(options.fftSize);
    this.orderedR = new Float32Array(options.fftSize);
    this.plan = new SpectralPlan(options);
  }
  push(l: number, r: number): Float32Array | undefined {
    const n = this.l.length;
    this.l[this.cursor] = l;
    this.r[this.cursor] = r;
    this.cursor = (this.cursor + 1) % n;
    this.count++;
    if (this.count < n) return;
    if (this.count > n && --this.until > 0) return;
    this.until = n / 4;
    for (let i = 0; i < n; i++) {
      const k = (this.cursor + i) % n;
      this.orderedL[i] = this.l[k];
      this.orderedR[i] = this.r[k];
    }
    return this.plan.calculate(this.orderedL, this.orderedR);
  }
}
/** Bounded 300ms synchronized raw/filtered PCM; older long histories belong to main. */
class PairedRing {
  readonly capacity: number;
  private arrays: Float32Array[];
  private times: Float64Array;
  private cursor = 0;
  count = 0;
  latestFrame = 0;
  constructor(rate: number) {
    this.capacity = Math.ceil(rate * 0.3);
    this.arrays = Array.from(
      { length: 8 },
      () => new Float32Array(this.capacity),
    );
    this.times = new Float64Array(this.capacity);
  }
  push(frame: number, time: number, values: number[]) {
    for (let i = 0; i < 8; i++) this.arrays[i][this.cursor] = values[i];
    this.times[this.cursor] = time;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    this.latestFrame = frame;
  }
  read(count = this.count) {
    count = Math.min(count, this.count);
    const values = this.arrays.map(() => new Float32Array(count)),
      times = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const k = (this.cursor - count + i + this.capacity) % this.capacity;
      for (let ch = 0; ch < 8; ch++) values[ch][i] = this.arrays[ch][k];
      times[i] = this.times[k];
    }
    return { values, times, firstFrame: this.latestFrame - count + 1 };
  }
}
interface PendingSlice {
  bucket: number;
  start: number;
  end: number;
  firstFrame: number;
  lastFrame: number;
  time: number;
  powers: Float32Array;
  edges: Float32Array;
  interpolated: Uint8Array;
  gap: boolean;
}
/** Deterministic continuous pipeline; process accepts interleaved Float32 LR packets. */
export class AnalysisEngine {
  private config: AnalysisConfig;
  private session = -1;
  private epoch = -1;
  private rate = 0;
  private expectedFrame = -1;
  private sequence = -1;
  private forcedGap = false;
  private ring?: PairedRing;
  private filters: Record<Channel, BandSplitter> = {} as Record<
    Channel,
    BandSplitter
  >;
  private yin?: YinDetector;
  private nextPitch = 0;
  private pitch = { frequency: null as number | null, confidence: 0 };
  private scopeFloor = 0;
  private spectrumTask?: STFT;
  private spectrogramTask?: STFT;
  private spectrumFrame?: SpectralFrame;
  private smoothing: Float32Array = new Float32Array();
  private peaks = new Float32Array();
  private peakTimes = new Float64Array();
  private spectrumTime: number | undefined;
  private pendingSlice?: PendingSlice;
  private spectrogramGap = true;
  private bucket?: WaveBucket;
  private bandSums: Record<Channel, [number, number, number]> = {} as Record<
    Channel,
    [number, number, number]
  >;
  private waveformGap = true;
  private autoGain = 1;
  private gainTime: number | undefined;
  private scopePhase: number | undefined;
  private nextStereoFrame = 0;
  constructor(config: AnalysisConfig) {
    this.config = structuredClone(config);
  }
  get effectiveFrame() {
    return Math.max(0, this.expectedFrame);
  }
  markGap() {
    this.forcedGap = true;
  }
  reset(sessionId: number, captureEpoch: number) {
    this.session = sessionId;
    this.epoch = captureEpoch;
    this.expectedFrame = -1;
    this.sequence = -1;
    this.forcedGap = true;
    this.clear();
  }
  configure(next: AnalysisConfig) {
    const before = this.config;
    this.config = structuredClone(next);
    const changed = (id: ModuleId) =>
      before.revisions[id] !== next.revisions[id] ||
      before.settings.layout.enabled[id] !== next.settings.layout.enabled[id];
    if (changed("spectrum")) {
      this.spectrumTask = next.settings.layout.enabled.spectrum
        ? new STFT(next.settings.spectrum)
        : undefined;
      this.clearSpectrum();
    }
    if (changed("spectrogram") || before.buckets !== next.buckets) {
      this.spectrogramTask = next.settings.layout.enabled.spectrogram
        ? new STFT(next.settings.spectrogram)
        : undefined;
      this.pendingSlice = undefined;
      this.spectrogramGap = true;
    }
    if (changed("waveform")) {
      this.bucket = undefined;
      this.waveformGap = true;
    }
    if (changed("oscilloscope")) {
      this.pitch = { frequency: null, confidence: 0 };
      this.nextPitch = this.effectiveFrame;
      this.scopeFloor = this.effectiveFrame;
      this.scopePhase = undefined;
    }
    if (changed("stereometer")) {
      this.autoGain = 1;
      this.gainTime = undefined;
      this.nextStereoFrame = this.effectiveFrame;
    }
  }
  private clearSpectrum() {
    this.spectrumFrame = undefined;
    this.smoothing = new Float32Array();
    this.peaks = new Float32Array();
    this.peakTimes = new Float64Array();
    this.spectrumTime = undefined;
  }
  private clear() {
    this.ring = this.rate ? new PairedRing(this.rate) : undefined;
    this.yin = this.rate ? new YinDetector(this.rate) : undefined;
    this.pitch = { frequency: null, confidence: 0 };
    this.nextPitch = 0;
    this.scopeFloor = Math.max(0, this.expectedFrame);
    this.scopePhase = undefined;
    if (this.rate)
      for (const ch of CHANNELS) this.filters[ch] = new BandSplitter(this.rate);
    const s = this.config.settings;
    this.spectrumTask = s.layout.enabled.spectrum
      ? new STFT(s.spectrum)
      : undefined;
    this.spectrogramTask = s.layout.enabled.spectrogram
      ? this.spectrumTask && sameSpectrum(s.spectrum, s.spectrogram)
        ? this.spectrumTask
        : new STFT(s.spectrogram)
      : undefined;
    this.clearSpectrum();
    this.pendingSlice = undefined;
    this.spectrogramGap = true;
    this.bucket = undefined;
    this.waveformGap = true;
    this.autoGain = 1;
    this.gainTime = undefined;
    this.nextStereoFrame = Math.max(0, this.expectedFrame);
  }
  process(packet: PCMPacket): AnalysisResult | undefined {
    if (
      packet.sessionId < this.session ||
      (packet.sessionId === this.session && packet.captureEpoch < this.epoch)
    )
      return;
    if (
      !Number.isFinite(packet.sampleRate) ||
      packet.sampleRate < 8000 ||
      packet.sampleRate > 384000 ||
      !Number.isSafeInteger(packet.sampleFrameCount) ||
      packet.sampleFrameCount < 1 ||
      packet.buffer.byteLength < packet.sampleFrameCount * 8 ||
      packet.buffer.byteLength % 4 !== 0 ||
      !Number.isSafeInteger(packet.firstSampleIndex) ||
      packet.firstSampleIndex < 0 ||
      !Number.isSafeInteger(packet.sequence) ||
      packet.sequence < 0 ||
      !Number.isFinite(packet.visualStart)
    )
      return;
    if (
      packet.sessionId === this.session &&
      packet.captureEpoch === this.epoch &&
      packet.sequence <= this.sequence
    )
      return;
    const gap =
      this.forcedGap ||
      packet.discontinuity ||
      packet.sessionId !== this.session ||
      packet.captureEpoch !== this.epoch ||
      packet.sampleRate !== this.rate ||
      this.expectedFrame !== packet.firstSampleIndex ||
      this.sequence + 1 !== packet.sequence;
    this.session = packet.sessionId;
    this.epoch = packet.captureEpoch;
    this.rate = packet.sampleRate;
    if (gap) {
      this.expectedFrame = packet.firstSampleIndex;
      this.clear();
    }
    this.forcedGap = false;
    const pcm = new Float32Array(packet.buffer),
      waveform: WaveBucket[] = [],
      spectrogram: SpectralSlice[] = [],
      s = this.config.settings;
    let sumSquares = 0;
    for (let i = 0; i < packet.sampleFrameCount; i++) {
      const l = pcm[i * 2],
        r = pcm[i * 2 + 1];
      if (!Number.isFinite(l) || !Number.isFinite(r)) {
        this.markGap();
        return;
      }
      const frame = packet.firstSampleIndex + i,
        time = packet.visualStart + i / this.rate;
      const bands = {} as Record<Channel, [number, number, number]>;
      for (const ch of CHANNELS)
        bands[ch] = this.filters[ch].process(channelValue(l, r, ch));
      this.ring!.push(frame, time, [
        l,
        r,
        bands.L[0],
        bands.R[0],
        bands.L[1],
        bands.R[1],
        bands.L[2],
        bands.R[2],
      ]);
      sumSquares += (l * l + r * r) / 2;
      if (s.layout.enabled.waveform)
        this.waveSample(frame, time, l, r, bands, waveform);
      const p = this.spectrumTask?.push(l, r);
      const q =
        this.spectrogramTask === this.spectrumTask
          ? p
          : this.spectrogramTask?.push(l, r);
      if (p) this.spectrumUpdate(p, frame, time);
      if (q) this.spectrogramUpdate(q, frame, time, spectrogram);
      if (
        s.layout.enabled.oscilloscope &&
        s.oscilloscope.mode === "pitch" &&
        frame >= this.nextPitch &&
        this.ring!.count >= this.yin!.length &&
        frame - this.scopeFloor + 1 >= this.yin!.length
      ) {
        const recent = this.ring!.read(this.yin!.length),
          chosen = Float32Array.from(recent.values[0], (v, j) =>
            channelValue(v, recent.values[1][j], s.oscilloscope.channel),
          );
        this.pitch = this.yin!.detect(chosen);
        this.nextPitch = frame + Math.ceil(this.rate * 0.02);
      }
    }
    this.expectedFrame = packet.firstSampleIndex + packet.sampleFrameCount;
    this.sequence = packet.sequence;
    const time = packet.visualStart + (packet.sampleFrameCount - 1) / this.rate,
      latestFrame = this.expectedFrame - 1;
    return {
      type: "result",
      sessionId: this.session,
      captureEpoch: this.epoch,
      sequence: this.sequence,
      time,
      latestFrame,
      sampleRate: this.rate,
      gap,
      revisions: { ...this.config.revisions },
      waveform: s.layout.enabled.waveform ? waveform : undefined,
      spectrogram: s.layout.enabled.spectrogram ? spectrogram : undefined,
      spectrum:
        s.layout.enabled.spectrum && this.spectrumFrame
          ? {
              ...this.spectrumFrame,
              powers: this.spectrumFrame.powers.slice(),
              peakDb: s.spectrum.peaks ? this.peaks.slice() : undefined,
            }
          : undefined,
      stereometer: s.layout.enabled.stereometer
        ? this.stereoSnapshot(time, latestFrame)
        : undefined,
      oscilloscope: s.layout.enabled.oscilloscope
        ? this.scopeSnapshot(time, latestFrame)
        : undefined,
      rms: Math.sqrt(sumSquares / packet.sampleFrameCount),
    };
  }
  private waveSample(
    frame: number,
    time: number,
    l: number,
    r: number,
    bands: Record<Channel, [number, number, number]>,
    out: WaveBucket[],
  ) {
    const key = Math.floor((frame * 500) / this.rate);
    if (
      this.bucket &&
      Math.floor((this.bucket.firstFrame * 500) / this.rate) !== key
    )
      this.finishBucket(out);
    if (!this.bucket) {
      this.bucket = {
        start: time,
        end: time,
        firstFrame: frame,
        lastFrame: frame,
        gap: this.waveformGap,
        channels: Object.fromEntries(
          CHANNELS.map((ch) => [ch, emptyStats()]),
        ) as Record<Channel, Stats>,
      };
      this.waveformGap = false;
      for (const ch of CHANNELS) this.bandSums[ch] = [0, 0, 0];
    }
    for (const ch of CHANNELS) {
      const st = this.bucket.channels[ch],
        v = channelValue(l, r, ch);
      st.min = Math.min(st.min, v);
      st.max = Math.max(st.max, v);
      st.sumSquares += v * v;
      st.count++;
      for (let b = 0; b < 3; b++) this.bandSums[ch][b] += bands[ch][b] ** 2;
    }
    this.bucket.end = time + 1 / this.rate;
    this.bucket.lastFrame = frame + 1;
    if (Math.floor(((frame + 1) * 500) / this.rate) !== key)
      this.finishBucket(out);
  }
  private finishBucket(out: WaveBucket[]) {
    if (!this.bucket) return;
    if (
      this.config.settings.waveform.style === "bands" ||
      this.config.settings.waveform.bandHistory !== "off"
    )
      this.bucket.bands = Object.fromEntries(
        CHANNELS.map((ch) => [
          ch,
          this.bandSums[ch].map((v) =>
            Math.sqrt(v / this.bucket!.channels[ch].count),
          ),
        ]),
      ) as Record<Channel, [number, number, number]>;
    out.push(this.bucket);
    this.bucket = undefined;
  }
  private spectrumUpdate(raw: Float32Array, frame: number, time: number) {
    const size = this.config.settings.spectrum.fftSize,
      hop = size / 4,
      centerFrame = frame - (size - 1) / 2,
      centerTime = time - (size - 1) / 2 / this.rate,
      dt =
        this.spectrumTime === undefined
          ? hop / this.rate
          : centerTime - this.spectrumTime;
    this.smoothing = smoothPower(
      this.smoothing,
      raw,
      this.config.settings.spectrum.smoothing,
      dt,
    );
    this.spectrumTime = centerTime;
    if (this.peaks.length !== raw.length) {
      this.peaks = new Float32Array(raw.length).fill(-160);
      this.peakTimes = new Float64Array(raw.length).fill(centerTime);
    }
    for (let i = 0; i < raw.length; i++) {
      const db = Math.max(-160, powerDb(this.smoothing[i]));
      if (db >= this.peaks[i]) {
        this.peaks[i] = db;
        this.peakTimes[i] = centerTime;
      } else {
        const decay = Math.max(
          0,
          centerTime - Math.max(centerTime - dt, this.peakTimes[i] + 0.5),
        );
        this.peaks[i] = Math.max(db, this.peaks[i] - 12 * decay);
      }
    }
    this.spectrumFrame = {
      time: centerTime,
      latestFrame: frame,
      centerFrame,
      powers: this.smoothing,
      fftSize: size,
      sampleRate: this.rate,
      revision: this.config.revisions.spectrum,
    };
  }
  private spectrogramUpdate(
    raw: Float32Array,
    frame: number,
    time: number,
    out: SpectralSlice[],
  ) {
    const n = this.config.settings.spectrogram.fftSize,
      centerFrame = frame - (n - 1) / 2,
      centerTime = time - (n - 1) / 2 / this.rate,
      bucket = Math.floor(centerTime * 100 + 1e-8),
      mapped = aggregateFrequency(raw, this.rate, n, this.config.buckets);
    if (this.pendingSlice && this.pendingSlice.bucket !== bucket) {
      const p = this.pendingSlice;
      out.push({
        time: p.time,
        start: p.start,
        end: p.end,
        firstFrame: p.firstFrame,
        lastFrame: p.lastFrame,
        codes: Uint16Array.from(p.powers, (v) => encodeDb(powerDb(v))),
        edges: p.edges,
        interpolated: p.interpolated,
        gap: p.gap,
        revision: this.config.revisions.spectrogram,
      });
      this.pendingSlice = undefined;
    }
    if (!this.pendingSlice) {
      this.pendingSlice = {
        bucket,
        start: centerTime - n / 8 / this.rate,
        end: centerTime + n / 8 / this.rate,
        firstFrame: centerFrame,
        lastFrame: centerFrame,
        time: centerTime,
        ...mapped,
        gap: this.spectrogramGap,
      };
      this.spectrogramGap = false;
    } else {
      const p = this.pendingSlice;
      p.end = centerTime + n / 8 / this.rate;
      p.lastFrame = centerFrame;
      for (let i = 0; i < p.powers.length; i++)
        p.powers[i] = Math.max(p.powers[i], mapped.powers[i]);
    }
  }
  private stereoSnapshot(time: number, latestFrame: number): StereoPoints {
    const full = this.ring!.read(),
      rate = this.rate,
      n = Math.min(full.values[0].length, Math.ceil(rate * 0.1)),
      rho = correlation(
        full.values[0].subarray(full.values[0].length - n),
        full.values[1].subarray(full.values[1].length - n),
      );
    let ll = 0,
      rr = 0;
    for (let i = full.times.length - n; i < full.times.length; i++) {
      ll += full.values[0][i] ** 2;
      rr += full.values[1][i] ** 2;
    }
    const silent = n === 0 || (ll / n < 1e-10 && rr / n < 1e-10);
    const windowFrames = Math.ceil(
        (this.config.settings.stereometer.windowMs * rate) / 1000,
      ),
      startIndex = Math.max(0, full.times.length - windowFrames);
    // Emit each completed millisecond once; main retains these pairs for age-based persistence.
    let lo = Math.max(0, this.nextStereoFrame - full.firstFrame),
      hi = Math.min(
        full.times.length,
        Math.ceil(
          (Math.floor(((latestFrame + 1) * 1000) / rate) * rate) / 1000,
        ) - full.firstFrame,
      );
    const first = full.firstFrame + lo;
    if (
      Math.floor((first * 1000) / rate) ===
      Math.floor(((first - 1) * 1000) / rate)
    )
      while (
        lo < hi &&
        Math.floor(((full.firstFrame + lo) * 1000) / rate) ===
          Math.floor((first * 1000) / rate)
      )
        lo++;
    hi = Math.max(lo, hi);
    this.nextStereoFrame = full.firstFrame + hi;
    const l = full.values[0].subarray(lo, hi),
      r = full.values[1].subarray(lo, hi),
      indices = selectStereoPairs(
        l,
        r,
        rate,
        full.firstFrame + lo,
        this.config.mobile || this.config.settings.performance.economy
          ? 12
          : 24,
      ),
      points: number[] = [];
    let max = 0;
    if (!silent)
      for (const local of indices) {
        const i = lo + local,
          lv = full.values[0][i],
          rv = full.values[1][i];
        if (Math.max(Math.abs(lv), Math.abs(rv)) < 1e-5) continue;
        points.push(full.times[i], ...full.values.map((ch) => ch[i]));
      }
    for (let i = startIndex; i < full.times.length; i++)
      max = Math.max(
        max,
        Math.abs((full.values[0][i] + full.values[1][i]) / 2),
        Math.abs((full.values[0][i] - full.values[1][i]) / 2),
      );
    const target = max >= 1e-5 ? Math.max(1, Math.min(8, 0.9 / max)) : 1,
      dt = this.gainTime === undefined ? 0 : Math.max(0, time - this.gainTime),
      tau = target < this.autoGain ? 0.1 : 0.5;
    this.autoGain += (target - this.autoGain) * (1 - Math.exp(-dt / tau));
    this.gainTime = time;
    return {
      values: new Float32Array(points),
      stride: 9,
      correlation: rho,
      autoGain: !silent && max >= 1e-5 ? this.autoGain : 1,
      latestFrame,
      startFrame: full.firstFrame + lo,
      time,
      revision: this.config.revisions.stereometer,
    };
  }
  private scopeSnapshot(time: number, latestFrame: number): ScopeFrame {
    const all = this.ring!.read(),
      s = this.config.settings.oscilloscope,
      offset = Math.max(0, this.scopeFloor - all.firstFrame),
      samples = Float32Array.from(all.values[0].subarray(offset), (v, i) =>
        channelValue(v, all.values[1][offset + i], s.channel),
      ),
      frequency = s.mode === "pitch" ? this.pitch.frequency : null,
      duration = frequency ? s.cycles / frequency : s.windowMs / 1000;
    if (s.mode === "pitch" && samples.length < this.yin!.length)
      return {
        values: new Float32Array(),
        duration,
        frequency: null,
        confidence: 0,
        locked: false,
        time,
        latestFrame,
        startFrame: all.firstFrame + offset,
        revision: this.config.revisions.oscilloscope,
        preparing: true,
      };
    const predicted =
      frequency && this.scopePhase !== undefined
        ? this.scopePhase -
          (all.firstFrame + offset) +
          Math.floor(
            (latestFrame - duration * this.rate - this.scopePhase) /
              (this.rate / frequency),
          ) *
            (this.rate / frequency)
        : undefined;
    const captured = triggerWindow(
        samples,
        this.rate,
        duration * this.rate,
        s.trigger,
        s.level,
        predicted,
      ),
      startFrame = all.firstFrame + offset + captured.start;
    if (captured.locked && frequency) this.scopePhase = startFrame;
    return {
      values: captured.values,
      duration,
      frequency,
      confidence: frequency ? this.pitch.confidence : 0,
      locked: captured.locked,
      time,
      latestFrame,
      startFrame,
      revision: this.config.revisions.oscilloscope,
      preparing: captured.preparing,
    };
  }
}
/** PCM ownership is returned in finally, including rejected, stale and overload packets. */
export class AnalysisWorkerHost {
  private engine?: AnalysisEngine;
  private credits = 3;
  private currentFrame = 0;
  constructor(private send: (o: WorkerOutput, t?: Transferable[]) => void) {
    this.send({ type: "ready" });
  }
  handle(input: WorkerInput) {
    if (input.type === "config") {
      if (this.engine) this.engine.configure(input.config);
      else this.engine = new AnalysisEngine(input.config);
      this.send({
        type: "configured",
        revisions: { ...input.config.revisions },
        effectiveFrame: this.engine.effectiveFrame,
      });
      return;
    }
    if (input.type === "credit") {
      if (Number.isFinite(input.count))
        this.credits = Math.max(
          0,
          Math.min(3, this.credits + Math.floor(Math.max(0, input.count))),
        );
      return;
    }
    if (input.type === "tick") {
      this.currentFrame = Math.max(this.currentFrame, input.currentFrame);
      return;
    }
    if (input.type === "reset") {
      this.engine?.reset(input.sessionId, input.captureEpoch);
      return;
    }
    try {
      if (!this.engine) return;
      if (
        this.credits === 0 ||
        this.currentFrame - (input.firstSampleIndex + input.sampleFrameCount) >
          input.sampleRate * 0.1
      ) {
        this.engine.markGap();
        return;
      }
      const result = this.engine.process(input);
      if (result) {
        this.credits--;
        const transfer: Transferable[] = [];
        if (result.spectrum) {
          transfer.push(result.spectrum.powers.buffer as ArrayBuffer);
          if (result.spectrum.peakDb)
            transfer.push(result.spectrum.peakDb.buffer as ArrayBuffer);
        }
        for (const slice of result.spectrogram ?? [])
          transfer.push(
            slice.codes.buffer as ArrayBuffer,
            slice.interpolated.buffer as ArrayBuffer,
          );
        if (result.stereometer)
          transfer.push(result.stereometer.values.buffer as ArrayBuffer);
        if (result.oscilloscope)
          transfer.push(result.oscilloscope.values.buffer as ArrayBuffer);
        this.send(result, transfer);
      }
    } finally {
      this.send({ type: "recycle", buffer: input.buffer }, [input.buffer]);
    }
  }
}
