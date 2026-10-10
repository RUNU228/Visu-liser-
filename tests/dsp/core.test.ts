import { describe, expect, it } from "vitest";
import {
  spectralPower,
  powerDb,
  smoothPower,
  encodeDb,
  decodeDb,
  frequencyPosition,
  frequencyAt,
  aggregateFrequency,
  combineStats,
  channelValue,
  YinDetector,
  triggerWindow,
  BandSplitter,
  correlation,
  selectStereoPairs,
} from "../../src/analysis/dsp";

const tone = (f: number, n = 4096, fs = 48000, a = 0.5, phase = 0) =>
  Float32Array.from(
    { length: n },
    (_, i) => a * Math.sin((2 * Math.PI * f * i) / fs + phase),
  );
describe("calibrated spectral power", () => {
  for (const window of ["hann", "blackman"] as const)
    it(`calibrates ${window} bin-centered tone without phase cancellation`, () => {
      const x = tone(750),
        r = Float32Array.from(x, (v) => -v);
      const p = spectralPower(x, r, {
        fftSize: 4096,
        window,
        channel: "stereo",
      });
      expect(powerDb(p[64])).toBeCloseTo(-6.0206, 3);
      expect(
        spectralPower(x, r, { fftSize: 4096, window, channel: "M" })[64],
      ).toBe(0);
    });
  it("does not double DC or Nyquist", () => {
    const x = new Float32Array(1024).fill(0.5);
    expect(
      powerDb(
        spectralPower(x, x, { fftSize: 1024, window: "hann", channel: "L" })[0],
      ),
    ).toBeCloseTo(-6.0206, 3);
    const y = Float32Array.from(x, (_, i) => (i % 2 ? 0.5 : -0.5));
    expect(
      powerDb(
        spectralPower(y, y, {
          fftSize: 1024,
          window: "hann",
          channel: "R",
        })[512],
      ),
    ).toBeCloseTo(-6.0206, 3);
  });
  it("decays 90% smoothing in power by elapsed sample time", () => {
    let p = new Float32Array([0.25]);
    for (let i = 0; i < 120; i++)
      p = smoothPower(p, new Float32Array([0]), 90, 1 / 60);
    expect(powerDb(p[0])).toBeCloseTo(-60.9297, 3);
    expect(
      powerDb(
        smoothPower(new Float32Array([0.25]), new Float32Array([0]), 90, 2)[0],
      ),
    ).toBeCloseTo(-60.9297, 3);
  });
});
describe("history precision and bucket statistics", () => {
  it("preserves levels independently of display floor and exact silence sentinel", () => {
    expect(encodeDb(-Infinity)).toBe(0);
    expect(encodeDb(-161)).toBe(0);
    for (const db of [-159, -90, -6.02, 0, 100])
      expect(Math.abs(decodeDb(encodeDb(db)) - db)).toBeLessThan(0.0025);
    expect(decodeDb(0)).toBe(-160);
    expect(decodeDb(65535)).toBe(160);
  });
  it("maps frequency monotonically and identifies interpolation below bin spacing", () => {
    for (const scale of ["log", "linear", "mel"] as const) {
      expect(frequencyPosition(20, 20, 20000, scale)).toBeCloseTo(0);
      expect(
        frequencyAt(
          frequencyPosition(1000, 20, 20000, scale),
          20,
          20000,
          scale,
        ),
      ).toBeCloseTo(1000, 5);
    }
    const p = new Float32Array(2049);
    p[64] = 0.25;
    const mapped = aggregateFrequency(p, 48000, 4096, 1024);
    expect(mapped.edges.length).toBe(1025);
    expect(Math.max(...mapped.powers)).toBeCloseTo(0.25, 6);
    expect(mapped.interpolated[0]).toBe(1);
  });
  it("combines energy and counts instead of averaging RMS or extrema", () => {
    expect(
      combineStats(
        { min: -1, max: 1, sumSquares: 2, count: 2 },
        { min: 0, max: 0.5, sumSquares: 0.25, count: 1 },
      ),
    ).toEqual({ min: -1, max: 1, sumSquares: 2.25, count: 3 });
    expect(channelValue(0.5, -0.5, "M")).toBe(0);
    expect(channelValue(0.5, -0.5, "S")).toBe(0.5);
  });
});
describe("paired stereo and crossover filters", () => {
  it("computes dot-product correlation and suppresses negligible channels", () => {
    const x = tone(100, 4800);
    expect(correlation(x, x)).toBeCloseTo(1);
    expect(
      correlation(
        x,
        Float32Array.from(x, (v) => -v),
      ),
    ).toBeCloseTo(-1);
    expect(correlation(x, new Float32Array(4800))).toBeNull();
  });
  it("keeps paired extrema deterministically within each millisecond budget", () => {
    const l = new Float32Array(96),
      r = new Float32Array(96);
    l[31] = 2;
    r[32] = -3;
    const selected = selectStereoPairs(l, r, 48000, 0, 24);
    expect(selected.length).toBeLessThanOrEqual(48);
    expect(selected).toContain(31);
    expect(selected).toContain(32);
    expect(selectStereoPairs(l, r, 48000, 0, 24)).toEqual(selected);
  });
  it("implements LR4 -6dB crossover magnitude and stops resetting between blocks", () => {
    const f = new BandSplitter(48000);
    const x = tone(200, 48000, 48000, 1);
    let energy = 0;
    for (let i = 0; i < x.length; i++) {
      const bands = f.process(x[i]);
      if (i >= 24000) energy += bands[0] ** 2;
    }
    expect(Math.sqrt(energy / 24000) * Math.SQRT2).toBeCloseTo(0.5, 2);
    f.reset();
    expect(f.process(0)).toEqual([0, 0, 0]);
  });
});
describe("YIN and real waveform triggering", () => {
  for (const frequency of [40, 100, 2000])
    it(`detects ${frequency}Hz with CMND confidence`, () => {
      const found = new YinDetector(48000).detect(tone(frequency));
      expect(found.frequency).not.toBeNull();
      expect(Math.abs(found.frequency! / frequency - 1)).toBeLessThan(0.01);
      expect(found.confidence).toBeGreaterThanOrEqual(0.8);
    });
  it("rejects exact silence and deterministic nonperiodic noise", () => {
    const yin = new YinDetector(48000);
    expect(yin.detect(new Float32Array(4096)).frequency).toBeNull();
    let seed = 77;
    const noise = Float32Array.from({ length: 4096 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return seed / 2147483648;
    });
    expect(yin.detect(noise).frequency).toBeNull();
  });
  it("scales detector windows to resampled 44.1kHz PCM", () => {
    const detector = new YinDetector(44100),
      found = detector.detect(tone(100, detector.length, 44100));
    expect(found.frequency).toBeCloseTo(100, 1);
    expect(found.confidence).toBeGreaterThan(0.8);
  });
  for (const polarity of ["rising", "falling"] as const)
    for (const level of [-0.25, 0.25])
      it(`interpolates ${polarity} trigger at ${level}`, () => {
        const data = tone(100, 14400);
        const capture = triggerWindow(data, 48000, 480, "rising", level);
        const actual = triggerWindow(data, 48000, 480, polarity, level);
        expect(capture.locked).toBe(true);
        expect(actual.locked).toBe(true);
        expect(actual.values[0]).toBeCloseTo(level, 5);
        expect(actual.values.at(-1)).toBeCloseTo(level, 4);
        expect(actual.values.length).toBe(481);
        expect(Math.sign(actual.values[1] - actual.values[0])).toBe(
          polarity === "rising" ? 1 : -1,
        );
      });
  it("shows preparing rather than zero padding a missing window", () => {
    expect(triggerWindow(tone(100, 100), 48000, 480, "off", 0).preparing).toBe(
      true,
    );
  });
});
