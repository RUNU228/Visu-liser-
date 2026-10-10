import { describe, it, expect } from "vitest";
import {
  defaults,
  validateSettings,
  builtinPresets,
  linkTime,
  effectiveDuration,
  reserveAnalysis,
} from "../../src/settings/schema";
describe("settings contract", () => {
  it("uses complete master defaults", () => {
    const s = defaults();
    expect(s.waveform.lane1).toBe("S");
    expect(s.waveform.lane2).toBe("M");
    expect(s.spectrum.tilt).toBe(0);
    expect(s.analysis.linked).toBe(false);
    expect(s.layout.order).toHaveLength(5);
  });
  it("rejects invalid input atomically", () => {
    for (const value of [
      { spectrum: { fftSize: 3000 } },
      { waveform: { gain: NaN } },
      { layout: { order: ["spectrum", "spectrum"] } },
      { schemaVersion: 2 },
      { analysis: { linked: "yes" } },
      { analysis: { sharedDuration: 80 } },
    ])
      expect(() => validateSettings(value)).toThrow();
  });
  it("ignores unknown fields, fills missing fields and migrates recognized schema", () => {
    expect(
      validateSettings({ schemaVersion: 0, unknown: 1 }).schemaVersion,
    ).toBe(1);
    expect(validateSettings({}).spectrum.smoothing).toBe(90);
  });
  it("presets fully replace the persisted domain", () => {
    expect(builtinPresets()["Night Trace"].spectrum.tilt).toBe(0);
    expect(builtinPresets()["Reference Study"].spectrum.tilt).toBe(4.5);
    expect(builtinPresets()["Clean Analysis"].stereometer.persistenceMs).toBe(
      0,
    );
  });
  it("links with clamp without destroying unlinked horizons", () => {
    const s = defaults();
    s.waveform.duration = 1;
    s.waveform.speed = 4;
    const linked = linkTime(s, true);
    expect(linked.analysis.sharedDuration).toBe(0.5);
    expect(effectiveDuration(linked, "spectrogram")).toBe(0.5);
    expect(effectiveDuration(linkTime(linked, false), "waveform")).toBe(0.25);
  });
  it("reserves maximum valid histories within 64 MiB and spectral 24 MiB", () => {
    const s = defaults();
    s.spectrogram.duration = 20;
    s.spectrogram.speed = 0.25;
    s.waveform.duration = 10;
    s.waveform.speed = 0.25;
    s.spectrum.fftSize = 16384;
    s.spectrogram.fftSize = 16384;
    const r = reserveAnalysis(s, 192000);
    expect(r.total).toBeLessThan(64 * 1024 ** 2);
    expect(r.spectrogram).toBeLessThan(24 * 1024 ** 2);
  });
});
