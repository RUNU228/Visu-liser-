import { describe, it, expect, vi, afterEach } from "vitest";
import { SettingsStorage } from "../../src/settings/storage";
import { defaults } from "../../src/settings/schema";
afterEach(() => vi.unstubAllGlobals());
function local() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
  });
  return map;
}
describe("durable settings", () => {
  it("restores every successfully saved user preset", () => {
    local();
    const storage = new SettingsStorage(() => {});
    const presets = Array.from({ length: 105 }, (_, i) => ({
      id: String(i),
      name: `Preset ${i}`,
      settings: defaults(),
    }));
    expect(storage.save(defaults(), presets)).toBe(true);
    expect(storage.load().presets).toHaveLength(105);
  });
  it("rejects a future stored envelope even if nested settings are current", () => {
    const map = local();
    const s = defaults();
    s.appearance.theme = "dark";
    map.set(
      "visualizer.settings.v1",
      JSON.stringify({ schemaVersion: 999, settings: s, presets: [] }),
    );
    const notices: string[] = [];
    const loaded = new SettingsStorage((text) => notices.push(text)).load();
    expect(loaded.settings.appearance.theme).toBe("light");
    expect(notices).toHaveLength(1);
  });
  it("storage quota failure is reported once and never confirms durable saves", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });
    const notices: string[] = [];
    const storage = new SettingsStorage((text) => notices.push(text));
    expect(storage.save(defaults(), [])).toBe(false);
    expect(storage.save(defaults(), [])).toBe(false);
    expect(notices).toHaveLength(1);
  });
});
