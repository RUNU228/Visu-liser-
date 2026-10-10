import { describe, expect, it, vi } from "vitest";
import { AnalysisStore } from "../../src/visualizers/store";
import { defaults } from "../../src/settings/schema";
import type {
  AnalysisResult,
  ScopeFrame,
  WaveBucket,
} from "../../src/shared/types";
import {
  projectWaveform,
  historyTime,
  historyPosition,
  historySpans,
  scopeExtrema,
  pointOpacity,
} from "../../src/visualizers/geometry";
import { PlotRenderer } from "../../src/visualizers/renderers";
import { encodeDb } from "../../src/analysis/dsp";
function canvas(width = 88, height = 100) {
  let image: ImageData | undefined;
  const context = new Proxy(
    {
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: (value: ImageData) => {
        image = value;
      },
    } as Record<string, unknown>,
    { get: (o, k) => (k in o ? o[k as string] : () => {}) },
  );
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  });
  return {
    element: {
      clientWidth: width,
      clientHeight: height,
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement,
    image: () => image,
  };
}
const scope = (frame: number, time: number): ScopeFrame => ({
  values: new Float32Array([0, 0.5, 0]),
  duration: 0.02,
  frequency: 100,
  confidence: 0.99,
  locked: true,
  time,
  latestFrame: frame,
  startFrame: frame - 2,
  revision: 1,
  preparing: false,
});
const result = (frame: number, time: number): AnalysisResult => ({
  type: "result",
  sessionId: 1,
  captureEpoch: 1,
  sequence: frame,
  time,
  latestFrame: frame,
  sampleRate: 48000,
  gap: false,
  revisions: {
    waveform: 1,
    spectrogram: 1,
    stereometer: 1,
    oscilloscope: 1,
    spectrum: 1,
  },
  rms: 0.2,
  stereometer: {
    values: new Float32Array([time, 0.5, 0.5, 0, 0, 0, 0, 0, 0]),
    stride: 9,
    time,
    latestFrame: frame,
    startFrame: frame,
    revision: 1,
    correlation: 1,
    autoGain: 1,
  },
  oscilloscope: scope(frame, time),
});
const bucket = (
  start: number,
  end: number,
  min = -0.5,
  max = 0.5,
  gap = false,
): WaveBucket => ({
  start,
  end,
  firstFrame: start * 48000,
  lastFrame: end * 48000,
  gap,
  channels: Object.fromEntries(
    ["L", "R", "M", "S"].map((ch) => [
      ch,
      { min, max, sumSquares: 1, count: 4 },
    ]),
  ) as WaveBucket["channels"],
});
describe("accepted persistence history", () => {
  it("clears old paired points and scope trails at a captured PCM gap", () => {
    const s = defaults();
    s.oscilloscope.persistenceMs = 200;
    const store = new AnalysisStore(s);
    store.accept(result(100, 1));
    store.accept({ ...result(200, 1.02), gap: true });
    expect(store.stereoCount).toBe(1);
    expect(store.stereoData[(store.stereoWrite - 1) * 9]).toBeCloseTo(1.02);
    expect(store.scopeFrames).toHaveLength(1);
  });
  it("keeps every accepted scope frame even when display snapshots are skipped", () => {
    const s = defaults();
    s.oscilloscope.persistenceMs = 200;
    const store = new AnalysisStore(s);
    for (let i = 0; i < 5; i++) store.accept(result(100 + i, 1 + i * 0.021));
    expect(store.scopeFrames).toHaveLength(5);
    expect(store.scopeFrames.map((f) => f.latestFrame)).toEqual([
      100, 101, 102, 103, 104,
    ]);
  });
  it("removes expired point rows instead of retaining them until ring wrap", () => {
    const s = defaults();
    s.stereometer.persistenceMs = 0;
    s.stereometer.windowMs = 20;
    const store = new AnalysisStore(s);
    store.accept(result(1, 0));
    store.accept(result(2, 1));
    expect(store.stereoCount).toBe(1);
  });
  it("bounds scope age and never accumulates duplicate latest frames", () => {
    const s = defaults();
    s.oscilloscope.persistenceMs = 200;
    const store = new AnalysisStore(s);
    store.accept(result(100, 1));
    store.accept(result(100, 1));
    expect(store.scopeFrames).toHaveLength(1);
    store.accept(result(300, 3));
    expect(store.scopeFrames).toHaveLength(1);
    store.clear("oscilloscope");
    expect(store.scopeFrames).toHaveLength(0);
  });
  it("preserves different paired samples whose Float32 visual timestamps round to the same value", () => {
    const store = new AnalysisStore(defaults()),
      a = result(1, 3600),
      b = result(2, 3600 + 1 / 48000);
    store.accept(a);
    store.accept(b);
    store.accept(b);
    expect(store.stereoCount).toBe(2);
  });
  it("retains the full scope decay horizon at192k without an unbounded snapshot pool", () => {
    const s = defaults();
    s.oscilloscope.persistenceMs = 200;
    const store = new AnalysisStore(s);
    for (let i = 0; i < 220; i++)
      store.accept({
        ...result(i * 1024, (i * 1024) / 192000),
        sampleRate: 192000,
      });
    expect(store.scopeFrames.length).toBeGreaterThan(45);
    expect(store.scopeFrames.length).toBeLessThanOrEqual(57);
    expect(store.scopeFrames[0].time).toBeLessThan(0.1);
    expect(store.oscilloscope!.latestFrame).toBe(219 * 1024);
  });
});
describe("sample-time and pixel geometry", () => {
  it("expands measured waveform bucket intervals without losing extrema or RMS", () => {
    const p = projectWaveform([bucket(0, 0.002, -1, 1)], 0, 0.004, 8, "L");
    expect(Array.from(p.counts.slice(0, 4))).toEqual([1, 1, 1, 1]);
    expect(Array.from(p.maxs.slice(0, 4))).toEqual([1, 1, 1, 1]);
    expect(Array.from(p.mins.slice(0, 4))).toEqual([-1, -1, -1, -1]);
    for (let i = 0; i < 4; i++)
      expect(Math.sqrt(p.energy[i] / p.counts[i])).toBe(0.5);
    expect(p.counts[4]).toBe(0);
  });
  it("does not bridge a missing waveform interval and preserves first gap-bucket extrema", () => {
    const p = projectWaveform(
      [bucket(0, 0.002), bucket(0.004, 0.006, -1, 1, true)],
      0,
      0.008,
      8,
      "L",
    );
    expect(p.counts[2]).toBe(0);
    expect(p.counts[3]).toBe(0);
    expect(p.gaps.has(4)).toBe(true);
    expect(p.maxs[4]).toBe(1);
  });
  it("maps Sweep pointer phase to the newest available captured cycle", () => {
    expect(historyTime(0.2, 10, 8, "sweep")).toBeCloseTo(9.6);
    expect(historyTime(0.5, 10, 8, "sweep")).toBe(4);
    expect(historyPosition(9.6, 10, 8, "sweep")).toBeCloseTo(0.2);
    expect(historyTime(0.5, 10, 8, "scroll")).toBe(6);
    expect(historyPosition(6, 10, 8, "scroll")).toBe(0.5);
  });
  it("splits a supported spectrogram interval across the sweep boundary", () => {
    const spans = historySpans(7.98, 8.02, 8.03, 8, "sweep");
    expect(spans).toHaveLength(2);
    expect(spans[0][0]).toBeCloseTo(0.9975);
    expect(spans[0][1]).toBe(1);
    expect(spans[1][0]).toBe(0);
    expect(spans[1][1]).toBeCloseTo(0.0025);
  });
  it("preserves a scope impulse and interpolated pixel endpoints", () => {
    const p = scopeExtrema(new Float32Array([0, 1, 0, -1, 0]), 2);
    expect(Array.from(p.mins)).toEqual([0, -1]);
    expect(Array.from(p.maxs)).toEqual([1, 0]);
    const q = scopeExtrema(new Float32Array([0, 1]), 4);
    expect(q.mins[1]).toBeCloseTo(0.25);
    expect(q.maxs[1]).toBeCloseTo(0.5);
  });
  it("evaluates point persistence by visual age and handles a zero time constant", () => {
    expect(pointOpacity(0.08, 0.08, 0.25)).toBe(1);
    expect(pointOpacity(0.33, 0.08, 0.25)).toBeCloseTo(Math.exp(-1));
    expect(pointOpacity(0.1, 0.08, 0)).toBe(0);
    expect(pointOpacity(3, 0.2, 0.5)).toBe(0);
  });
});
describe("rendered measurement fidelity", () => {
  const slice = (time: number, level: number) => ({
    time,
    start: time - 0.02,
    end: time + 0.02,
    firstFrame: time * 48000,
    lastFrame: time * 48000,
    codes: new Uint16Array([encodeDb(level)]),
    edges: new Float32Array([20, 20000]),
    interpolated: new Uint8Array([0]),
    gap: false,
    revision: 1,
  });
  it("uses Sweep mapping for a retained spectrogram tooltip", () => {
    canvas();
    const s = defaults();
    s.spectrogram.timeMode = "sweep";
    const store = new AnalysisStore(s);
    store.time = 10;
    store.spectrogram = [slice(3.6, -30), slice(9.6, -10)];
    expect(
      new PlotRenderer("spectrogram").measure(0.2, 0.5, s, store),
    ).toContain("−0.40 с");
  });
  it("reports missing captured history instead of borrowing a nearby spectral measurement", () => {
    canvas();
    const s = defaults(),
      store = new AnalysisStore(s);
    store.time = 10;
    store.spectrogram = [slice(9.55, -10)];
    expect(
      new PlotRenderer("spectrogram").measure((9.59 - 2) / 8, 0.5, s, store),
    ).toBe("История недоступна");
  });
  it("measures the raw maximum of the rendered spectral pixel bucket", () => {
    const target = canvas(),
      s = defaults(),
      store = new AnalysisStore(s),
      powers = new Float32Array(513);
    powers[21] = 0.01;
    powers[22] = 0.25;
    store.spectrum = {
      powers,
      time: 1,
      latestFrame: 1023,
      centerFrame: 511.5,
      fftSize: 1024,
      sampleRate: 48000,
      revision: 1,
    };
    const renderer = new PlotRenderer("spectrum");
    renderer.render(target.element, s, store, 1);
    expect(
      renderer.measure(Math.log(1000 / 20) / Math.log(1000), 0.5, s, store),
    ).toContain("-6.02");
  });
  it("fades each spectral measurement before maximum pixel aggregation", () => {
    const target = canvas(49, 39),
      s = defaults();
    s.spectrogram.fade = 1;
    const store = new AnalysisStore(s);
    store.time = 10;
    store.spectrogram = [slice(8, 0), slice(9, -90)];
    new PlotRenderer("spectrogram").render(target.element, s, store, 1);
    expect(target.image()!.data[0]).toBe(Math.round(255 - 233 * Math.exp(-2)));
  });
  it("invalidates display lookup for gamma, trim and floor without altering raw history", () => {
    const target = canvas(49, 39),
      s = defaults(),
      store = new AnalysisStore(s);
    store.time = 10;
    const retained = slice(9, -45);
    store.spectrogram = [retained];
    const original = retained.codes.slice();
    const renderer = new PlotRenderer("spectrogram");
    renderer.render(target.element, s, store, 1);
    expect(target.image()!.data[0]).toBeGreaterThanOrEqual(138);
    expect(target.image()!.data[0]).toBeLessThanOrEqual(139);
    s.spectrogram.gamma = 2;
    renderer.render(target.element, s, store, 1);
    expect(target.image()!.data[0]).toBeGreaterThanOrEqual(196);
    expect(target.image()!.data[0]).toBeLessThanOrEqual(197);
    s.spectrogram.floor = -30;
    renderer.render(target.element, s, store, 1);
    expect(target.image()!.data[0]).toBe(255);
    s.analysis.trimDb = 24;
    renderer.render(target.element, s, store, 1);
    expect(target.image()!.data[0]).toBeLessThan(240);
    expect(retained.codes).toEqual(original);
  });
});
