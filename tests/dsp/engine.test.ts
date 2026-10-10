import { describe, expect, it } from "vitest";
import { AnalysisEngine, AnalysisWorkerHost } from "../../src/analysis/engine";
import { defaults } from "../../src/settings/schema";
import type {
  AnalysisConfig,
  AnalysisResult,
  PCMPacket,
  WorkerOutput,
} from "../../src/shared/types";
const config = (): AnalysisConfig => ({
  settings: defaults(),
  revisions: {
    spectrogram: 1,
    waveform: 1,
    spectrum: 1,
    stereometer: 1,
    oscilloscope: 1,
  },
  mobile: false,
  buckets: 1024,
});
function packet(
  first: number,
  count = 1024,
  sequence = Math.floor(first / 1024),
  f = 100,
  sign = 1,
): PCMPacket {
  const pcm = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    pcm[i * 2] = 0.5 * Math.sin((2 * Math.PI * f * (first + i)) / 48000);
    pcm[i * 2 + 1] = pcm[i * 2] * sign;
  }
  return {
    type: "pcm",
    buffer: pcm.buffer,
    sessionId: 1,
    captureEpoch: 1,
    firstSampleIndex: first,
    sampleFrameCount: count,
    sampleRate: 48000,
    sequence,
    discontinuity: false,
    visualStart: 10 + first / 48000,
  };
}
describe("continuous analysis engine", () => {
  it("preserves impulse extrema, M/S, energy and timing across packet boundaries", () => {
    const e = new AnalysisEngine(config());
    const p = packet(0, 101, 0, 0);
    const v = new Float32Array(p.buffer);
    v[190] = 1;
    v[191] = -1;
    const a = e.process(p)!;
    const b = e.process(packet(101, 100, 1, 0))!;
    const buckets = [...(a.waveform ?? []), ...(b.waveform ?? [])];
    expect(buckets[0].channels.S.max).toBe(1);
    expect(buckets[0].channels.S.sumSquares).toBe(1);
    expect(buckets[0].channels.M.max).toBe(0);
    expect(buckets[0].channels.S.count).toBe(96);
    expect(buckets[0].start).toBe(10);
    expect(buckets[0].end).toBeCloseTo(10.002);
    expect(buckets[0].lastFrame).toBe(96);
  });
  it("analyzes real anti-phase stereo and detects scope pitch without inventing waveforms", () => {
    const c = config();
    c.settings.oscilloscope.channel = "L";
    c.settings.oscilloscope.cycles = 4;
    const e = new AnalysisEngine(c);
    let result: AnalysisResult | undefined;
    for (let i = 0; i < 18; i++)
      result = e.process(packet(i * 1024, 1024, i, 40, -1));
    expect(result!.stereometer!.correlation).toBeCloseTo(-1);
    expect(result!.oscilloscope!.frequency).toBeCloseTo(40, 1);
    expect(result!.oscilloscope!.duration).toBeCloseTo(0.1, 3);
    expect(result!.oscilloscope!.preparing).toBe(false);
    expect(result!.oscilloscope!.values.length).toBeGreaterThanOrEqual(4801);
    expect(Math.max(...result!.spectrum!.powers)).toBeGreaterThan(0.01);
  });
  it("sends initialized silent powers and no origin point for exact silence", () => {
    const e = new AnalysisEngine(config());
    let result: AnalysisResult | undefined;
    for (let i = 0; i < 100; i++)
      result = e.process(packet(i * 1024, 1024, i, 0));
    expect(Math.max(...result!.spectrum!.powers)).toBe(0);
    expect(result!.stereometer!.values.length).toBe(0);
    expect(result!.stereometer!.correlation).toBeNull();
    expect(result!.oscilloscope!.frequency).toBeNull();
    expect(result!.rms).toBe(0);
  });
  it("suppresses point insertion when both correlation-window energies are below −100dBFS", () => {
    const e = new AnalysisEngine(config()),
      p = packet(0, 4800, 0, 1000);
    const pcm = new Float32Array(p.buffer);
    for (let i = 0; i < pcm.length; i++) pcm[i] *= 2.4e-5;
    const result = e.process(p)!;
    expect(result.stereometer!.correlation).toBeNull();
    expect(result.stereometer!.values).toHaveLength(0);
    expect(result.stereometer!.autoGain).toBe(1);
  });
  it("emits each selected stereo pair once across arbitrary PCM packet boundaries", () => {
    const e = new AnalysisEngine(config()),
      times: number[] = [];
    let frame = 0;
    for (let i = 0; i < 30; i++) {
      const n = i % 2 ? 113 : 317,
        result = e.process(packet(frame, n, i))!;
      for (let j = 0; j < result.stereometer!.values.length; j += 9)
        times.push(result.stereometer!.values[j]);
      frame += n;
    }
    expect(times.length).toBeGreaterThan(2000);
    expect(new Set(times).size).toBe(times.length);
    const buckets = new Map<number, number>();
    for (const t of times) {
      const key = Math.floor((t - 10) * 1000 + 1e-3);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    expect(Math.max(...buckets.values())).toBeLessThanOrEqual(24);
  });
  it("preserves identical paired selections for different PCM batching", () => {
    const run = (size: number) => {
      const e = new AnalysisEngine(config()),
        points: number[] = [];
      for (let first = 0, seq = 0; first < 6144; first += size, seq++) {
        const result = e.process(
          packet(first, Math.min(size, 6144 - first), seq),
        )!;
        points.push(...result.stereometer!.values);
      }
      return points;
    };
    const a = run(1024),
      b = run(317);
    expect(a.length).toBe(b.length);
    expect(a).toEqual(b);
  });
  it("reports uncorrelated seeded-noise channels over a five-second run", () => {
    const c = config();
    for (const id of [
      "waveform",
      "spectrum",
      "spectrogram",
      "oscilloscope",
    ] as const)
      c.settings.layout.enabled[id] = false;
    const e = new AnalysisEngine(c);
    let seed = 31,
      total = 0,
      n = 0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return seed / 2147483648;
    };
    for (let frame = 0, seq = 0; frame < 240000; frame += 1024, seq++) {
      const p = packet(frame, Math.min(1024, 240000 - frame), seq),
        pcm = new Float32Array(p.buffer);
      for (let i = 0; i < pcm.length; i++) pcm[i] = random();
      const result = e.process(p)!;
      if (frame > 4800) {
        total += result.stereometer!.correlation!;
        n++;
      }
    }
    expect(Math.abs(total / n)).toBeLessThan(0.1);
  });
  it("captures a full 100ms Free window and falling nonzero trigger from real PCM", () => {
    const c = config();
    c.settings.oscilloscope.mode = "free";
    c.settings.oscilloscope.windowMs = 100;
    c.settings.oscilloscope.trigger = "falling";
    c.settings.oscilloscope.level = 0.25;
    const e = new AnalysisEngine(c);
    let result: AnalysisResult | undefined;
    for (let i = 0; i < 15; i++) result = e.process(packet(i * 1024));
    expect(result!.oscilloscope!.values.length).toBe(4801);
    expect(result!.oscilloscope!.values[0]).toBeCloseTo(0.25, 4);
    expect(result!.oscilloscope!.locked).toBe(true);
    expect(result!.oscilloscope!.duration).toBe(0.1);
  });
  it("discards obsolete session packets and resumes a new epoch at its visual anchor", () => {
    const e = new AnalysisEngine(config());
    e.reset(2, 4);
    expect(e.process(packet(0))).toBeUndefined();
    const result = e.process({
      ...packet(200000, 1024, 0),
      sessionId: 2,
      captureEpoch: 4,
      visualStart: 11,
    })!;
    expect(result.time).toBeCloseTo(11 + 1023 / 48000);
    expect(result.waveform![0].start).toBe(11);
    expect(result.gap).toBe(true);
  });
  it("does not concatenate an epoch or sequence gap into an FFT window", () => {
    const e = new AnalysisEngine(config());
    e.process(packet(0));
    e.process(packet(1024));
    const p = packet(3072, 1024, 3);
    const r = e.process(p)!;
    expect(r.gap).toBe(true);
    expect(r.spectrum).toBeUndefined();
    expect(r.waveform![0].gap).toBe(true);
    expect(r.oscilloscope!.preparing).toBe(true);
    expect(e.process({ ...packet(4096), captureEpoch: 0 })).toBeUndefined();
  });
  it("resets only revised spectral task and keeps unrelated current spectrum", () => {
    const c = config(),
      e = new AnalysisEngine(c);
    for (let i = 0; i < 5; i++) e.process(packet(i * 1024));
    const next = structuredClone(c);
    next.revisions.spectrogram = 2;
    next.settings.spectrogram.fftSize = 8192;
    e.configure(next);
    const r = e.process(packet(5120))!;
    expect(r.spectrum!.fftSize).toBe(4096);
    expect(r.spectrum!.revision).toBe(1);
    expect(r.spectrogram?.length ?? 0).toBe(0);
  });
  it("caps retained spectral emission at 100 sample-timed slices per second", () => {
    const c = config();
    c.settings.spectrogram.fftSize = 1024;
    const e = new AnalysisEngine(c);
    const all = [];
    for (let i = 0; i < 48; i++)
      all.push(...(e.process(packet(i * 1024))!.spectrogram ?? []));
    expect(all.length).toBeLessThanOrEqual(100);
    expect(all.length).toBeGreaterThan(90);
    expect(
      all.every((s) => s.codes.length === 1024 && s.edges.length === 1025),
    ).toBe(true);
    expect(new Set(all.map((s) => Math.floor(s.time * 100 + 1e-6))).size).toBe(
      all.length,
    );
  });
  it("gives each STFT measurement its hop-width time support without blank columns", () => {
    const e = new AnalysisEngine(config()),
      slices = [];
    for (let i = 0; i < 7; i++)
      slices.push(...(e.process(packet(i * 1024))!.spectrogram ?? []));
    expect(slices.length).toBeGreaterThan(1);
    expect(slices[0].end - slices[0].start).toBeCloseTo(1024 / 48000, 8);
    expect(slices[0].end).toBeCloseTo(slices[1].start, 8);
    expect(slices[0].time).toBeCloseTo(10 + 2047.5 / 48000, 8);
  });
  it("combines the upper-frequency storage buckets by maximum within a 10ms group", () => {
    const c = config();
    c.settings.spectrogram.fftSize = 1024;
    const e = new AnalysisEngine(c),
      p = packet(0, 1536, 0, 7500);
    const samples = new Float32Array(p.buffer);
    for (let i = 0; i < 1536; i++) {
      const v =
        (i < 1024 ? 0.1 : 0.5) * Math.sin((2 * Math.PI * 7500 * i) / 48000);
      samples[i * 2] = v;
      samples[i * 2 + 1] = v;
    }
    const slice = e.process(p)!.spectrogram![0],
      bucket = Array.from(slice.edges).findIndex(
        (v, i) => v <= 7500 && slice.edges[i + 1] >= 7500,
      );
    // Independent direct DFT of the later of two grouped Hann windows.
    let re = 0,
      im = 0;
    for (let j = 0; j < 1024; j++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / 1024),
        v = samples[(256 + j) * 2] * w;
      re += v * Math.cos((-2 * Math.PI * 160 * j) / 1024);
      im += v * Math.sin((-2 * Math.PI * 160 * j) / 1024);
    }
    const expectedDb = 20 * Math.log10((2 * Math.hypot(re, im)) / 512);
    const actual = -160 + ((slice.codes[bucket] - 1) * 320) / 65534;
    expect(bucket).toBeGreaterThan(513);
    expect(actual).toBeCloseTo(expectedDb, 2);
  });
});
describe("bounded worker protocol", () => {
  it("can transfer every result and recycled PCM without detaching retained analysis state", () => {
    const outputs: WorkerOutput[] = [];
    const host = new AnalysisWorkerHost((output, transfer) =>
      outputs.push(structuredClone(output, { transfer: transfer ?? [] })),
    );
    host.handle({ type: "config", config: config() });
    for (let i = 0; i < 12; i++) {
      const p = packet(i * 1024);
      host.handle(p);
      expect(p.buffer.byteLength).toBe(0);
      host.handle({ type: "credit", count: 1 });
    }
    const results = outputs.filter(
      (v): v is AnalysisResult => v.type === "result",
    );
    expect(results).toHaveLength(12);
    expect(results.at(-1)!.spectrum!.powers.length).toBe(2049);
    expect(results.at(-1)!.oscilloscope!.values.length).toBeGreaterThan(400);
  });
  it("recycles an invalid unaligned PCM buffer without crashing numerical analysis", () => {
    const output: WorkerOutput[] = [];
    const host = new AnalysisWorkerHost((o) => output.push(o));
    host.handle({ type: "config", config: config() });
    expect(() =>
      host.handle({ ...packet(0), buffer: new ArrayBuffer(8193) }),
    ).not.toThrow();
    expect(output.filter((v) => v.type === "recycle")).toHaveLength(1);
    expect(output.filter((v) => v.type === "result")).toHaveLength(0);
  });
  it("always recycles transferred PCM, limits to three results and resumes with credit", () => {
    const output: WorkerOutput[] = [],
      transfers: Transferable[][] = [];
    const host = new AnalysisWorkerHost((o, t) => {
      output.push(o);
      transfers.push(t ?? []);
    });
    host.handle({ type: "config", config: config() });
    for (let i = 0; i < 6; i++) host.handle(packet(i * 1024));
    expect(output.filter((o) => o.type === "result")).toHaveLength(3);
    expect(output.filter((o) => o.type === "recycle")).toHaveLength(6);
    for (let i = 0; i < output.length; i++)
      if (output[i].type === "recycle")
        expect(transfers[i][0]).toBe(
          (output[i] as { buffer: ArrayBuffer }).buffer,
        );
    host.handle({ type: "credit", count: 999 });
    host.handle(packet(6144));
    expect(
      (output.filter((o) => o.type === "result").at(-1) as AnalysisResult).gap,
    ).toBe(true);
  });
  it("rejects PCM older than 100ms relative to sample clock and acknowledges boundary", () => {
    const output: WorkerOutput[] = [];
    const host = new AnalysisWorkerHost((o) => output.push(o));
    host.handle({ type: "config", config: config() });
    host.handle({ type: "tick", currentFrame: 10000 });
    host.handle(packet(0));
    expect(output.filter((o) => o.type === "result")).toHaveLength(0);
    expect(output.filter((o) => o.type === "recycle")).toHaveLength(1);
    host.handle(packet(9216));
    host.handle({ type: "config", config: config() });
    expect(output.at(-1)).toMatchObject({
      type: "configured",
      effectiveFrame: 10240,
    });
  });
});
