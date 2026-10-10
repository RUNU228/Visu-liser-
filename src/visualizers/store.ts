import {
  MODULES,
  type AnalysisResult,
  type Settings,
  type SpectralSlice,
  type WaveBucket,
  type ModuleId,
  type ScopeFrame,
} from "../shared/types";
import { effectiveDuration, reserveAnalysis } from "../settings/schema";
export interface Mapping {
  time: number;
  frame: number;
  media: number;
  rate: number;
  sampleRate: number;
}
export class AnalysisStore {
  time = 0;
  latestFrame = 0;
  sampleRate = 48000;
  rms = 0;
  waveform: WaveBucket[] = [];
  spectrogram: SpectralSlice[] = [];
  spectrum: AnalysisResult["spectrum"];
  stereometer: AnalysisResult["stereometer"];
  oscilloscope: AnalysisResult["oscilloscope"];
  version = 0;
  gapCount = 0;
  settings: Settings;
  maps: Mapping[] = [];
  stereoData = new Float32Array(72000 * 9);
  stereoWrite = 0;
  stereoCount = 0;
  stereoRevision = 0;
  scopeFrames: ScopeFrame[] = [];
  scopeRevision = 0;
  private lastStereoFrame = -1;
  revisions = Object.fromEntries(MODULES.map((id) => [id, 1])) as Record<
    ModuleId,
    number
  >;
  private waveHead = 0;
  private spectralHead = 0;
  private edges: Float32Array | null = null;
  private interpolation: Uint8Array | null = null;
  latency: number[] = [];
  centerAge: number[] = [];
  frameTimes: number[] = [];
  renderTimes: number[] = [];
  lastRender = 0;
  error = "";
  fallback = false;
  constructor(settings: Settings) {
    this.settings = settings;
  }
  clear(id?: ModuleId) {
    if (!id || id === "waveform") {
      this.waveform = [];
      this.waveHead = 0;
    }
    if (!id || id === "spectrogram") {
      this.spectrogram = [];
      this.spectralHead = 0;
      this.edges = null;
      this.interpolation = null;
    }
    if (!id || id === "spectrum") this.spectrum = undefined;
    if (!id || id === "stereometer") {
      this.stereometer = undefined;
      this.stereoWrite = 0;
      this.stereoCount = 0;
      this.lastStereoFrame = -1;
      this.stereoRevision++;
    }
    if (!id || id === "oscilloscope") {
      this.oscilloscope = undefined;
      this.scopeFrames = [];
      this.scopeRevision++;
    }
    if (!id) {
      this.time = 0;
      this.latestFrame = 0;
      this.maps = [];
    }
    this.version++;
  }
  accept(result: AnalysisResult) {
    this.time = result.time;
    this.latestFrame = result.latestFrame;
    this.sampleRate = result.sampleRate;
    this.rms = result.rms;
    if (result.gap) {
      this.gapCount++;
      this.clear("stereometer");
      this.clear("oscilloscope");
    }
    if (
      result.revisions.waveform === this.revisions.waveform &&
      result.waveform
    )
      this.waveform.push(...result.waveform);
    if (
      result.revisions.spectrogram === this.revisions.spectrogram &&
      result.spectrogram
    ) {
      for (const slice of result.spectrogram) {
        if (!this.edges) {
          this.edges = slice.edges;
          this.interpolation = slice.interpolated;
        }
        slice.edges = this.edges;
        slice.interpolated = this.interpolation!;
        this.spectrogram.push(slice);
      }
    }
    if (
      result.revisions.spectrum === this.revisions.spectrum &&
      result.spectrum
    )
      this.spectrum = result.spectrum;
    if (
      result.revisions.stereometer === this.revisions.stereometer &&
      result.stereometer
    ) {
      this.stereometer = result.stereometer;
      const points = result.stereometer;
      if (points.latestFrame > this.lastStereoFrame) {
        this.lastStereoFrame = points.latestFrame;
        for (let i = 0; i < points.values.length; i += points.stride) {
          for (let j = 0; j < 9; j++)
            this.stereoData[this.stereoWrite * 9 + j] =
              points.values[i + j] ?? 0;
          this.stereoWrite = (this.stereoWrite + 1) % 72000;
          this.stereoCount = Math.min(72000, this.stereoCount + 1);
        }
      }
    }
    if (
      result.revisions.oscilloscope === this.revisions.oscilloscope &&
      result.oscilloscope
    ) {
      const frame = result.oscilloscope;
      this.oscilloscope = frame;
      if (frame.preparing) this.scopeFrames = [];
      else if (this.scopeFrames.at(-1)?.latestFrame !== frame.latestFrame) {
        const previous = this.scopeFrames.at(-1);
        if (
          previous &&
          Math.floor(previous.time * 50 + 1e-8) ===
            Math.floor(frame.time * 50 + 1e-8)
        )
          this.scopeFrames[this.scopeFrames.length - 1] = frame;
        else this.scopeFrames.push(frame);
      }
    }
    this.prunePersistence();
    const waveHorizon = Math.max(
      effectiveDuration(this.settings, "waveform"),
      this.settings.waveform.bandHistory === "off"
        ? 0
        : this.settings.waveform.bandHistory === "slow"
          ? 8
          : 2,
    );
    while (
      this.waveHead < this.waveform.length &&
      this.waveform[this.waveHead].end < result.time - waveHorizon
    )
      this.waveHead++;
    while (
      this.spectralHead < this.spectrogram.length &&
      this.spectrogram[this.spectralHead].end <
        result.time - effectiveDuration(this.settings, "spectrogram")
    )
      this.spectralHead++;
    if (this.waveHead > 1000) {
      this.waveform = this.waveform.slice(this.waveHead);
      this.waveHead = 0;
    }
    if (this.spectralHead > 100) {
      this.spectrogram = this.spectrogram.slice(this.spectralHead);
      this.spectralHead = 0;
    }
    this.version++;
  }
  prunePersistence() {
    const s = this.settings,
      oldest =
        this.time -
        s.stereometer.windowMs / 1000 -
        (s.stereometer.persistenceMs / 1000) * Math.log(255);
    while (this.stereoCount) {
      const row = (this.stereoWrite - this.stereoCount + 72000) % 72000;
      if (this.stereoData[row * 9] >= oldest) break;
      this.stereoCount--;
    }
    const scopeOldest =
      this.time - (s.oscilloscope.persistenceMs / 1000) * Math.log(255);
    this.scopeFrames = this.scopeFrames
      .filter((frame) => frame.time >= scopeOldest)
      .slice(-60);
  }
  mediaTime(time: number) {
    let map = this.maps[0];
    for (const segment of this.maps) {
      if (segment.time <= time) map = segment;
      else break;
    }
    return map ? map.media + (time - map.time) * map.rate : null;
  }
  recordRender(
    context: AudioContext | undefined,
    now: number,
    duration: number,
  ) {
    if (this.lastRender) this.frameTimes.push(now - this.lastRender);
    this.lastRender = now;
    this.renderTimes.push(duration);
    if (context && this.latestFrame) {
      this.latency.push(
        Math.max(
          0,
          (context.currentTime - this.latestFrame / context.sampleRate) * 1000,
        ),
      );
      if (this.spectrum)
        this.centerAge.push(
          Math.max(
            0,
            (context.currentTime -
              this.spectrum.centerFrame / context.sampleRate) *
              1000,
          ),
        );
    }
    for (const values of [
      this.latency,
      this.centerAge,
      this.frameTimes,
      this.renderTimes,
    ])
      if (values.length > 7200) values.splice(0, values.length - 7200);
  }
  diagnostics() {
    const percentile = (a: number[], p: number) => {
      if (!a.length) return 0;
      const sorted = [...a].sort((x, y) => x - y);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    };
    let history = 0;
    for (const slice of this.spectrogram)
      history += slice.codes.byteLength + 128;
    history += this.waveform.length * 512;
    const reservation = reserveAnalysis(this.settings, this.sampleRate);
    return {
      sampleRate: this.sampleRate,
      buckets: reservation.buckets,
      reservedBytes: reservation.total,
      historyBytes: history,
      gaps: this.gapCount,
      latencyMedian: percentile(this.latency, 0.5),
      latencyP95: percentile(this.latency, 0.95),
      latencyMax: percentile(this.latency, 1),
      centerAgeP95: percentile(this.centerAge, 0.95),
      fps: 1000 / (percentile(this.frameTimes, 0.5) || 1),
      renderP95: percentile(this.renderTimes, 0.95),
      samples: this.latency.length,
    };
  }
}
