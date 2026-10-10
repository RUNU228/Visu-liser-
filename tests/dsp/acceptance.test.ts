import { describe, expect, it } from "vitest";
import { AnalysisEngine } from "../../src/analysis/engine";
import { defaults } from "../../src/settings/schema";
import type {
  AnalysisConfig,
  AnalysisResult,
  PCMPacket,
} from "../../src/shared/types";

const sampleRate = 48000;
// A periodic captured waveform with a small second harmonic. Comparing every
// returned value to independent PCM interpolation also rejects a synthesized sine.
const sample = (frame: number, frequency: number) =>
  Math.fround(
    0.45 * Math.sin((2 * Math.PI * frequency * frame) / sampleRate) +
      0.04 * Math.sin((4 * Math.PI * frequency * frame) / sampleRate + 0.4),
  );
function packet(first: number, sequence: number, frequency: number): PCMPacket {
  const pcm = new Float32Array(2048);
  for (let i = 0; i < 1024; i++) {
    pcm[2 * i] = sample(first + i, frequency);
    pcm[2 * i + 1] = pcm[2 * i];
  }
  return {
    type: "pcm",
    buffer: pcm.buffer,
    sessionId: 1,
    captureEpoch: 1,
    firstSampleIndex: first,
    sampleFrameCount: 1024,
    sampleRate,
    sequence,
    discontinuity: false,
    visualStart: 2 + first / sampleRate,
  };
}
function config(
  cycles: 1 | 4,
  trigger: "rising" | "falling",
  level: number,
): AnalysisConfig {
  const settings = defaults();
  for (const id of [
    "spectrogram",
    "spectrum",
    "waveform",
    "stereometer",
  ] as const)
    settings.layout.enabled[id] = false;
  Object.assign(settings.oscilloscope, {
    mode: "pitch",
    channel: "L",
    cycles,
    trigger,
    level,
  });
  return {
    settings,
    revisions: {
      waveform: 1,
      spectrogram: 1,
      spectrum: 1,
      stereometer: 1,
      oscilloscope: 1,
    },
    mobile: false,
    buckets: 1024,
  };
}
describe("specification Pitch scope capture acceptance", () => {
  for (const testCase of [
    { frequency: 40, cycles: 4 as const, seconds: 0.1, minimumValues: 4801 },
    { frequency: 2000, cycles: 1 as const, seconds: 0.0005, minimumValues: 25 },
  ]) {
    for (const trigger of ["rising", "falling"] as const)
      it(`${testCase.frequency}Hz / ${testCase.cycles} cycles captures the complete ${trigger} window from PCM`, () => {
        const level = trigger === "rising" ? 0.25 : -0.25,
          engine = new AnalysisEngine(config(testCase.cycles, trigger, level));
        let result: AnalysisResult | undefined;
        for (let i = 0; i < 18; i++)
          result = engine.process(packet(i * 1024, i, testCase.frequency));
        const scope = result!.oscilloscope!,
          values = scope.values,
          endFrame = scope.startFrame + scope.duration * sampleRate;
        expect(scope.preparing).toBe(false);
        expect(scope.locked).toBe(true);
        expect(scope.confidence).toBeGreaterThanOrEqual(0.8);
        expect(
          Math.abs(scope.frequency! / testCase.frequency - 1),
        ).toBeLessThan(0.01);
        expect(scope.duration).toBeCloseTo(
          testCase.seconds,
          testCase.frequency === 40 ? 5 : 7,
        );
        expect(values.length).toBeGreaterThanOrEqual(testCase.minimumValues);
        expect(endFrame).toBeLessThanOrEqual(scope.latestFrame + 1e-6);
        expect(scope.startFrame).toBeGreaterThanOrEqual(
          scope.latestFrame - Math.ceil(0.3 * sampleRate) + 1,
        );
        expect(values[0]).toBeCloseTo(level, 5);
        expect(Math.sign(values[1] - values[0])).toBe(
          trigger === "rising" ? 1 : -1,
        );
        let maximumError = 0,
          risingZeroCrossings = 0,
          fallingZeroCrossings = 0;
        for (let i = 0; i < values.length; i++) {
          const frame =
              scope.startFrame +
              (i / (values.length - 1)) * scope.duration * sampleRate,
            lo = Math.floor(frame),
            fraction = frame - lo;
          const captured =
            (1 - fraction) * sample(lo, testCase.frequency) +
            fraction * sample(lo + 1, testCase.frequency);
          maximumError = Math.max(maximumError, Math.abs(values[i] - captured));
          if (i && values[i - 1] <= 0 && values[i] > 0) risingZeroCrossings++;
          if (i && values[i - 1] >= 0 && values[i] < 0) fallingZeroCrossings++;
        }
        expect(maximumError).toBeLessThan(2e-6);
        expect(risingZeroCrossings).toBe(testCase.cycles);
        expect(fallingZeroCrossings).toBe(testCase.cycles);
        expect(Math.max(...values)).toBeGreaterThan(0.4);
        expect(Math.min(...values)).toBeLessThan(-0.4);
      });
  }
  it("40Hz four-cycle startup never zero-pads a 100ms display into 4096 captured frames", () => {
    const engine = new AnalysisEngine(config(4, "rising", 0.25));
    let result: AnalysisResult | undefined;
    for (let i = 0; i < 4; i++)
      result = engine.process(packet(i * 1024, i, 40));
    expect(result!.oscilloscope!.preparing).toBe(true);
    expect(result!.oscilloscope!.values).toHaveLength(0);
    const complete = engine.process(packet(4096, 4, 40))!.oscilloscope!;
    expect(complete.preparing).toBe(false);
    expect(complete.values.length).toBeGreaterThanOrEqual(4801);
    expect(
      complete.startFrame + complete.duration * sampleRate,
    ).toBeLessThanOrEqual(5119 + 1e-6);
  });
});

describe("specification continuous spectral ridge acceptance", () => {
  it("tracks a deterministic 50Hz–10kHz linear chirp continuously within one FFT bin", () => {
    const c = config(1, "rising", 0);
    c.settings.layout.enabled.oscilloscope = false;
    c.settings.layout.enabled.spectrum = true;
    Object.assign(c.settings.spectrum, {
      fftSize: 1024,
      window: "hann",
      channel: "L",
      smoothing: 0,
    });
    const engine = new AnalysisEngine(c),
      seconds = 5,
      totalFrames = seconds * sampleRate,
      slope = (10000 - 50) / seconds,
      spacing = sampleRate / 1024;
    let previousBin = -1,
      firstFrequency = 0,
      lastFrequency = 0,
      frames = 0;
    for (
      let first = 0, sequence = 0;
      first < totalFrames;
      first += 1024, sequence++
    ) {
      const count = Math.min(1024, totalFrames - first),
        pcm = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        const t = (first + i) / sampleRate,
          v = 0.5 * Math.sin(2 * Math.PI * (50 * t + 0.5 * slope * t * t));
        pcm[i * 2] = v;
        pcm[i * 2 + 1] = v;
      }
      const result = engine.process({
        type: "pcm",
        buffer: pcm.buffer,
        sessionId: 1,
        captureEpoch: 1,
        firstSampleIndex: first,
        sampleFrameCount: count,
        sampleRate,
        sequence,
        discontinuity: false,
        visualStart: 2 + first / sampleRate,
      })!;
      const spectrum = result.spectrum!;
      let bin = 1;
      for (let k = 2; k < spectrum.powers.length; k++)
        if (spectrum.powers[k] > spectrum.powers[bin]) bin = k;
      const frequency = bin * spacing,
        expected = 50 + (slope * spectrum.centerFrame) / sampleRate;
      expect(Math.abs(frequency - expected)).toBeLessThanOrEqual(spacing);
      if (previousBin >= 0) {
        expect(bin).toBeGreaterThanOrEqual(previousBin);
        expect(bin - previousBin).toBeLessThanOrEqual(2);
      } else firstFrequency = frequency;
      expect(spectrum.powers[bin]).toBeGreaterThan(0.02);
      expect(Array.from(spectrum.powers).every(Number.isFinite)).toBe(true);
      previousBin = bin;
      lastFrequency = frequency;
      frames++;
    }
    expect(frames).toBeGreaterThan(230);
    expect(firstFrequency).toBeLessThan(150);
    expect(lastFrequency).toBeGreaterThan(9800);
  });
});
