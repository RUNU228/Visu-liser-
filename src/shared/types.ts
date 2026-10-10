export const MODULES = [
  "spectrogram",
  "waveform",
  "stereometer",
  "oscilloscope",
  "spectrum",
] as const;
export type ModuleId = (typeof MODULES)[number];
export type Channel = "L" | "R" | "M" | "S";
export type SpectralChannel = Channel | "stereo";
export type Scale = "log" | "linear" | "mel";
export type WindowKind = "hann" | "blackman";
export type FFTSize = 1024 | 2048 | 4096 | 8192 | 16384;
export interface SpectralSettings {
  fftSize: FFTSize;
  window: WindowKind;
  channel: SpectralChannel;
  scale: Scale;
  floor: number;
  ceiling: number;
}
export interface Settings {
  schemaVersion: 1;
  appearance: {
    theme: "light" | "dark";
    decoration: "off" | "subtle" | "normal";
    glitch: boolean;
    lighting: boolean;
  };
  layout: {
    requested: "composition" | "strip";
    order: ModuleId[];
    enabled: Record<ModuleId, boolean>;
  };
  analysis: { trimDb: number; linked: boolean; sharedDuration: number };
  performance: {
    fps: "auto" | "60" | "30";
    dpr: 1 | 1.5 | 2;
    economy: boolean;
  };
  spectrogram: SpectralSettings & {
    orientation: "horizontal" | "vertical";
    duration: number;
    speed: number;
    timeMode: "scroll" | "sweep";
    gamma: number;
    grid: boolean;
    labels: boolean;
    fade: number;
  };
  waveform: {
    lane1: Channel;
    lane2: Channel | "off";
    duration: number;
    speed: number;
    style: "outline" | "filled" | "bands";
    gain: number;
    rms: boolean;
    bandHistory: "off" | "fast" | "slow";
  };
  stereometer: {
    geometry: "ms" | "lr" | "auto";
    windowMs: number;
    persistenceMs: number;
    pointSize: number;
    gain: number;
    grid: boolean;
    labels: boolean;
    correlation: boolean;
    bands: boolean;
  };
  oscilloscope: {
    mode: "pitch" | "free";
    cycles: 1 | 2 | 4;
    windowMs: number;
    channel: Channel;
    trigger: "off" | "rising" | "falling";
    level: number;
    gain: number;
    persistenceMs: number;
    fill: boolean;
  };
  spectrum: SpectralSettings & {
    style: "line" | "bars" | "both";
    smoothing: number;
    tilt: number;
    peaks: boolean;
    note: boolean;
  };
}
export interface Stamp {
  sessionId: number;
  captureEpoch: number;
  firstSampleIndex: number;
  sampleFrameCount: number;
  sampleRate: number;
  sequence: number;
  discontinuity: boolean;
}
export interface PCMPacket extends Stamp {
  type: "pcm";
  buffer: ArrayBuffer;
  visualStart: number;
}
export interface Stats {
  min: number;
  max: number;
  sumSquares: number;
  count: number;
}
export interface WaveBucket {
  start: number;
  end: number;
  firstFrame: number;
  lastFrame: number;
  gap: boolean;
  channels: Record<Channel, Stats>;
  bands?: Record<Channel, [number, number, number]>;
}
export interface SpectralFrame {
  time: number;
  latestFrame: number;
  centerFrame: number;
  powers: Float32Array;
  peakDb?: Float32Array;
  fftSize: number;
  sampleRate: number;
  revision: number;
}
export interface SpectralSlice {
  time: number;
  start: number;
  end: number;
  firstFrame: number;
  lastFrame: number;
  codes: Uint16Array;
  edges: Float32Array;
  interpolated: Uint8Array;
  gap: boolean;
  revision: number;
}
export interface StereoPoints {
  values: Float32Array;
  /* interleaved time,L,R,lowL,lowR,midL,midR,highL,highR */ stride: number;
  correlation: number | null;
  autoGain: number;
  latestFrame: number;
  startFrame: number;
  time: number;
  revision: number;
}
export interface ScopeFrame {
  values: Float32Array;
  duration: number;
  frequency: number | null;
  confidence: number;
  locked: boolean;
  time: number;
  latestFrame: number;
  startFrame: number;
  revision: number;
  preparing: boolean;
}
export interface AnalysisResult {
  type: "result";
  sessionId: number;
  captureEpoch: number;
  sequence: number;
  time: number;
  latestFrame: number;
  sampleRate: number;
  gap: boolean;
  revisions: Record<ModuleId, number>;
  waveform?: WaveBucket[];
  spectrogram?: SpectralSlice[];
  spectrum?: SpectralFrame;
  stereometer?: StereoPoints;
  oscilloscope?: ScopeFrame;
  rms: number;
}
export interface AnalysisConfig {
  settings: Settings;
  revisions: Record<ModuleId, number>;
  mobile: boolean;
  buckets: number;
}
export type WorkerInput =
  | PCMPacket
  | { type: "config"; config: AnalysisConfig }
  | { type: "reset"; sessionId: number; captureEpoch: number }
  | { type: "credit"; count: number }
  | { type: "tick"; currentFrame: number };
export type WorkerOutput =
  | AnalysisResult
  | { type: "recycle"; buffer: ArrayBuffer }
  | { type: "ready" }
  | {
      type: "configured";
      revisions: Record<ModuleId, number>;
      effectiveFrame: number;
    };
