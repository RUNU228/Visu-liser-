import { describe, it, expect } from "vitest";
import { captureEligible, matchesBoundary } from "../../src/audio/capture";
import { AnalysisStore } from "../../src/visualizers/store";
import { defaults } from "../../src/settings/schema";
describe("capture eligibility", () => {
  it("hidden, frozen, interrupted, buffering, and disabled gates always override playback", () => {
    const state = {
      intent: true,
      playing: true,
      seeking: false,
      context: "running",
      visible: true,
      frozen: false,
      enabled: true,
      primary: true,
    };
    expect(captureEligible(state)).toBe(true);
    for (const change of [
      { visible: false },
      { frozen: true },
      { context: "suspended" },
      { playing: false },
      { enabled: false },
      { seeking: true },
      { intent: false },
    ])
      expect(captureEligible({ ...state, ...change })).toBe(false);
  });
  it("rejects stale source and capture epochs", () => {
    expect(matchesBoundary({ sessionId: 2, captureEpoch: 5 }, 2, 5)).toBe(true);
    expect(matchesBoundary({ sessionId: 1, captureEpoch: 5 }, 2, 5)).toBe(
      false,
    );
    expect(matchesBoundary({ sessionId: 2, captureEpoch: 4 }, 2, 5)).toBe(
      false,
    );
  });
  it("media mappings exclude pause time and honor playback speed", () => {
    const s = new AnalysisStore(defaults());
    s.maps = [
      { time: 0, media: 10, frame: 0, rate: 1, sampleRate: 48000 },
      { time: 5, media: 15, frame: 480000, rate: 2, sampleRate: 48000 },
    ];
    expect(s.mediaTime(6)).toBe(17);
  });
});
