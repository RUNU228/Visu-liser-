import { defaults, validateSettings } from "./schema";
import type { Settings } from "../shared/types";
export interface UserPreset {
  id: string;
  name: string;
  settings: Settings;
}
const KEY = "visualizer.settings.v1";
export class SettingsStorage {
  failed = false;
  constructor(private notice: (text: string) => void) {}
  private failure() {
    if (!this.failed) {
      this.failed = true;
      this.notice(
        "Настройки не удалось сохранить на этом устройстве. Доступен экспорт JSON.",
      );
    }
  }
  load(): { settings: Settings; presets: UserPreset[] } {
    try {
      const text = localStorage.getItem(KEY);
      if (!text) return { settings: defaults(), presets: [] };
      const data = JSON.parse(text);
      validateSettings({ schemaVersion: data.schemaVersion });
      const settings = validateSettings(data.settings ?? data);
      const presets: Array<UserPreset> = [];
      if (Array.isArray(data.presets))
        for (const p of data.presets) {
          try {
            if (typeof p.id === "string" && typeof p.name === "string")
              presets.push({
                id: p.id,
                name: p.name.slice(0, 80),
                settings: validateSettings(p.settings),
              });
          } catch {
            /* Skip an invalid stored preset independently. */
          }
        }
      return { settings, presets };
    } catch (error) {
      if (error instanceof DOMException) this.failure();
      else
        this.notice(
          "Сохранённые настройки повреждены. Восстановлены исходные значения.",
        );
      return { settings: defaults(), presets: [] };
    }
  }
  save(settings: Settings, presets: UserPreset[]) {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ schemaVersion: 1, settings, presets }),
      );
      return true;
    } catch {
      this.failure();
      return false;
    }
  }
}
export function parsePreset(text: string) {
  if (new Blob([text]).size > 65536)
    throw new Error("Файл настроек превышает 64 КиБ.");
  return validateSettings(JSON.parse(text));
}
export function exportPreset(settings: Settings, name = "Visu@lizer") {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\p{L}\p{N} _-]/gu, "") || "Visualizer"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
