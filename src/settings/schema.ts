import { MODULES, type Settings, type ModuleId } from "../shared/types";
export function defaults(): Settings {
  return {
    schemaVersion: 1,
    appearance: {
      theme: "light",
      decoration: "subtle",
      glitch: true,
      lighting: true,
    },
    layout: {
      requested: "composition",
      order: [...MODULES],
      enabled: Object.fromEntries(
        MODULES.map((id) => [id, true]),
      ) as Settings["layout"]["enabled"],
    },
    analysis: { trimDb: 0, linked: false, sharedDuration: 5 },
    performance: { fps: "auto", dpr: 2, economy: false },
    spectrogram: {
      orientation: "horizontal",
      duration: 8,
      speed: 1,
      timeMode: "scroll",
      fftSize: 4096,
      window: "hann",
      scale: "log",
      floor: -90,
      ceiling: 0,
      gamma: 1,
      channel: "stereo",
      grid: false,
      labels: true,
      fade: 0,
    },
    waveform: {
      lane1: "S",
      lane2: "M",
      duration: 5,
      speed: 1,
      style: "outline",
      gain: 1,
      rms: false,
      bandHistory: "off",
    },
    stereometer: {
      geometry: "ms",
      windowMs: 80,
      persistenceMs: 250,
      pointSize: 1,
      gain: 1,
      grid: false,
      labels: true,
      correlation: true,
      bands: false,
    },
    oscilloscope: {
      mode: "pitch",
      cycles: 1,
      windowMs: 20,
      channel: "M",
      trigger: "rising",
      level: 0,
      gain: 1,
      persistenceMs: 0,
      fill: true,
    },
    spectrum: {
      style: "both",
      smoothing: 90,
      tilt: 0,
      fftSize: 4096,
      window: "hann",
      scale: "log",
      floor: -90,
      ceiling: 0,
      channel: "stereo",
      peaks: false,
      note: false,
    },
  };
}
export interface Control {
  key: string;
  label: string;
  kind: "number" | "select" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: [string | number, string][];
}
const n = (
  key: string,
  label: string,
  min: number,
  max: number,
  step = 1,
  unit = "",
): Control => ({ key, label, kind: "number", min, max, step, unit });
const b = (key: string, label: string): Control => ({
  key,
  label,
  kind: "boolean",
});
const e = (
  key: string,
  label: string,
  options: [string | number, string][],
): Control => ({ key, label, kind: "select", options });
const channels: [string, string][] = [
  ["L", "Левый · L"],
  ["R", "Правый · R"],
  ["M", "Mid · (L+R)/2"],
  ["S", "Side · (L−R)/2"],
];
const spectral: Control[] = [
  e(
    "fftSize",
    "Размер FFT",
    [1024, 2048, 4096, 8192, 16384].map((v) => [v, String(v)]),
  ),
  e("window", "Окно", [
    ["hann", "Hann"],
    ["blackman", "Blackman"],
  ]),
  e("scale", "Шкала частот", [
    ["log", "Логарифмическая"],
    ["linear", "Линейная"],
    ["mel", "Mel"],
  ]),
  n("floor", "Нижний уровень", -120, -40, 1, "dBFS"),
  n("ceiling", "Верхний уровень", -30, 0, 1, "dBFS"),
  e("channel", "Канал", [["stereo", "Энергия L/R"], ...channels]),
];
export const controls: Record<string, Control[]> = {
  appearance: [
    e("theme", "Тема", [
      ["light", "Светлая"],
      ["dark", "Тёмная"],
    ]),
    e("decoration", "Декор", [
      ["off", "Выключен"],
      ["subtle", "Сдержанный"],
      ["normal", "Обычный"],
    ]),
    b("glitch", "Глитч"),
    b("lighting", "Мягкий свет"),
  ],
  analysis: [
    n("trimDb", "Визуальный уровень", -12, 12, 0.5, "dB"),
    b("linked", "Связать время двух историй"),
    n("sharedDuration", "Общая история", 0.5, 40, 0.5, "с"),
  ],
  performance: [
    e("fps", "Частота отрисовки", [
      ["auto", "Авто"],
      ["60", "60 FPS"],
      ["30", "30 FPS"],
    ]),
    e("dpr", "Предел DPR", [
      [1, "1"],
      [1.5, "1.5"],
      [2, "2"],
    ]),
    b("economy", "Экономный режим"),
  ],
  spectrogram: [
    e("orientation", "Ориентация", [
      ["horizontal", "Горизонтальная"],
      ["vertical", "Вертикальная"],
    ]),
    n("duration", "Базовая история", 2, 20, 0.5, "с"),
    n("speed", "Скорость прокрутки", 0.25, 4, 0.25, "×"),
    e("timeMode", "Движение времени", [
      ["scroll", "Прокрутка"],
      ["sweep", "Развёртка"],
    ]),
    ...spectral,
    n("gamma", "Контраст γ", 0.5, 2, 0.1),
    b("grid", "Сетка"),
    b("labels", "Подписи краёв"),
    n("fade", "Затухание истории", 0, 20, 1, "с · 0 выкл.; ≥2 до 1/e"),
  ],
  waveform: [
    e("lane1", "Дорожка 1", channels),
    e("lane2", "Дорожка 2", [["off", "Выключена"], ...channels]),
    n("duration", "Базовая история", 1, 10, 0.5, "с"),
    n("speed", "Скорость прокрутки", 0.25, 4, 0.25, "×"),
    e("style", "Стиль", [
      ["outline", "Контур"],
      ["filled", "Заливка"],
      ["bands", "Частотные слои"],
    ]),
    n("gain", "Визуальное усиление", 0.5, 4, 0.25, "×"),
    b("rms", "Огибающая RMS"),
    e("bandHistory", "История полос", [
      ["off", "Выключена"],
      ["fast", "Быстрая · 2 с"],
      ["slow", "Медленная · 8 с"],
    ]),
  ],
  stereometer: [
    e("geometry", "Геометрия", [
      ["ms", "M/S"],
      ["lr", "L/R · Лиссажу"],
      ["auto", "M/S · автоувеличение"],
    ]),
    n("windowMs", "Окно точек", 20, 200, 5, "мс"),
    n("persistenceMs", "Послесвечение", 0, 500, 10, "мс · до 1/e"),
    n("pointSize", "Размер точки", 1, 3, 0.5, "px"),
    n("gain", "Визуальное усиление", 0.5, 4, 0.25, "×"),
    b("grid", "Сетка"),
    b("labels", "Направления"),
    b("correlation", "Корреляция"),
    b("bands", "Частотные слои"),
  ],
  oscilloscope: [
    e("mode", "Режим", [
      ["pitch", "По тону"],
      ["free", "Свободный"],
    ]),
    e("cycles", "Число периодов", [
      [1, "Один"],
      [2, "Два"],
      [4, "Четыре"],
    ]),
    n("windowMs", "Свободное окно", 5, 100, 1, "мс"),
    e("channel", "Канал", channels),
    e("trigger", "Триггер", [
      ["off", "Выключен"],
      ["rising", "Восходящий"],
      ["falling", "Нисходящий"],
    ]),
    n("level", "Уровень триггера", -0.5, 0.5, 0.01),
    n("gain", "Визуальное усиление", 0.5, 4, 0.25, "×"),
    n("persistenceMs", "Послесвечение", 0, 200, 10, "мс · до 1/e"),
    b("fill", "Заливка"),
  ],
  spectrum: [
    e("style", "Стиль", [
      ["line", "Линия"],
      ["bars", "Столбцы"],
      ["both", "Оба"],
    ]),
    n("smoothing", "Сглаживание", 0, 99, 1, "%"),
    n("tilt", "Наклон", -6, 6, 0.5, "dB/октаву"),
    ...spectral,
    b("peaks", "Удержание пиков"),
    b("note", "Частота и нота"),
  ],
};
export function validateSettings(input: unknown): Settings {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Ожидался объект настроек.");
  const raw = input as Record<string, unknown>;
  if (
    raw.schemaVersion !== undefined &&
    raw.schemaVersion !== 0 &&
    raw.schemaVersion !== 1
  )
    throw new Error("Эта версия настроек не поддерживается.");
  const output = defaults();
  for (const [group, descriptors] of Object.entries(controls)) {
    const supplied = raw[group];
    if (supplied === undefined) continue;
    if (!supplied || typeof supplied !== "object" || Array.isArray(supplied))
      throw new Error(`Неверная группа: ${group}.`);
    for (const c of descriptors) {
      const v = (supplied as Record<string, unknown>)[c.key];
      if (v === undefined) continue;
      const invalid =
        c.kind === "boolean"
          ? typeof v !== "boolean"
          : c.kind === "select"
            ? !c.options!.some(([value]) => value === v)
            : typeof v !== "number" ||
              !Number.isFinite(v) ||
              v < c.min! ||
              v > c.max!;
      if (
        invalid ||
        (group === "spectrogram" &&
          c.key === "fade" &&
          typeof v === "number" &&
          v !== 0 &&
          v < 2)
      )
        throw new Error(`Недопустимое значение: ${c.label}.`);
      (output[group as keyof Settings] as unknown as Record<string, unknown>)[
        c.key
      ] = v;
    }
  }
  if (raw.layout !== undefined) {
    const l = raw.layout;
    if (!l || typeof l !== "object" || Array.isArray(l))
      throw new Error("Неверная компоновка.");
    const layout = l as Record<string, unknown>;
    if (layout.requested !== undefined) {
      if (!["composition", "strip"].includes(layout.requested as string))
        throw new Error("Неверная компоновка.");
      output.layout.requested = layout.requested as "composition" | "strip";
    }
    if (layout.order !== undefined) {
      if (
        !Array.isArray(layout.order) ||
        layout.order.length !== 5 ||
        new Set(layout.order).size !== 5 ||
        layout.order.some((id) => !MODULES.includes(id))
      )
        throw new Error("Порядок должен содержать пять разных модулей.");
      output.layout.order = [...layout.order] as ModuleId[];
    }
    if (layout.enabled !== undefined) {
      if (
        !layout.enabled ||
        typeof layout.enabled !== "object" ||
        Array.isArray(layout.enabled)
      )
        throw new Error("Неверная видимость.");
      for (const id of MODULES) {
        const v = (layout.enabled as Record<string, unknown>)[id];
        if (v === undefined) continue;
        if (typeof v !== "boolean") throw new Error("Неверная видимость.");
        output.layout.enabled[id] = v;
      }
    }
  }
  reserveAnalysis(output, 192000);
  return output;
}
export function effectiveDuration(s: Settings, id: "waveform" | "spectrogram") {
  return s.analysis.linked
    ? s.analysis.sharedDuration
    : s[id].duration / s[id].speed;
}
export function linkTime(s: Settings, linked: boolean): Settings {
  const next = structuredClone(s);
  if (linked && !s.analysis.linked)
    next.analysis.sharedDuration = Math.min(
      40,
      Math.max(0.5, s.waveform.duration / s.waveform.speed),
    );
  next.analysis.linked = linked;
  return next;
}
export function builtinPresets(): Record<string, Settings> {
  const white = defaults(),
    night = defaults(),
    reference = defaults(),
    clean = defaults();
  night.appearance.theme = "dark";
  reference.waveform.style = "bands";
  reference.spectrum.tilt = 4.5;
  clean.appearance.decoration = "off";
  clean.stereometer.persistenceMs = 0;
  clean.oscilloscope.persistenceMs = 0;
  clean.spectrum.smoothing = 50;
  return {
    "White Silence": white,
    "Night Trace": night,
    "Reference Study": reference,
    "Clean Analysis": clean,
  };
}
export function reserveAnalysis(s: Settings, sampleRate: number) {
  const seconds = effectiveDuration(s, "spectrogram");
  let buckets = 1024;
  while (buckets > 256 && seconds * 100 * (buckets * 2 + 128) > 24 * 1024 ** 2)
    buckets /= 2;
  const spectrogram =
    Math.ceil(seconds * 100 + 102) * (buckets * 2 + 128) + buckets * 8;
  const waveSeconds = Math.max(
    effectiveDuration(s, "waveform"),
    s.waveform.bandHistory === "slow"
      ? 8
      : s.waveform.bandHistory === "fast"
        ? 2
        : 0,
  );
  const waveform = Math.ceil(waveSeconds * 500 + 1004) * 512;
  const pcm =
    12 * 1024 * 2 * 4 + Math.ceil(sampleRate * 0.3) * 40 * 3 + 72000 * 9 * 4;
  const fft =
    (s.spectrum.fftSize + s.spectrogram.fftSize) * 128 +
    4 *
      2 ** Math.ceil(Math.log2(2 * Math.ceil((4096 * sampleRate) / 48000))) *
      8;
  const results =
    3 * (buckets * 2 + sampleRate * 0.1 * 2 * 4 + 8192 * 4 + 65536);
  // Explicit retained frequency projections, scalar lookup/raster scratch,
  // up to60 full100ms scope trails, and bounded stereo RGBA projection.
  const renderers =
    Math.ceil(seconds * 100 + 102) * 256 * 2 +
    65536 * 4 +
    960 * 256 * 4 +
    60 * (Math.ceil(sampleRate * 0.1) + 1) * 4 +
    1024 * 1024 * 4;
  const total =
    spectrogram + waveform + pcm + fft + results + renderers + 8 * 1024 ** 2;
  if (spectrogram > 24 * 1024 ** 2 || total > 64 * 1024 ** 2)
    throw new Error("Настройки превышают лимит памяти анализа 64 МиБ.");
  return {
    total,
    spectrogram,
    waveform,
    pcm,
    fft,
    results,
    renderers,
    buckets,
  };
}
