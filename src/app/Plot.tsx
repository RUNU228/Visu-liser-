import { useEffect, useRef, useState } from "react";
import type { ModuleId } from "../shared/types";
import type { AppController } from "./controller";
import type { RenderScheduler } from "../visualizers/scheduler";
import { Icon } from "./icons";
export const names: Record<ModuleId, string> = {
  spectrogram: "Spectrogram",
  waveform: "Waveform",
  stereometer: "Stereometer",
  oscilloscope: "Oscilloscope",
  spectrum: "Spectrum",
};
const descriptions: Record<ModuleId, string> = {
  spectrogram: "История частот и спектрального уровня сигнала.",
  waveform: "Минимумы, максимумы и энергия звуковых отсчётов во времени.",
  stereometer: "Синхронные левый и правый каналы, геометрия M/S и корреляция.",
  oscilloscope:
    "Короткое окно реального сигнала с триггером и определением тона.",
  spectrum: "Текущий спектральный уровень в dBFS, частота в герцах.",
};
export function Plot({
  id,
  controller,
  scheduler,
  focus,
  onFocus,
  onSettings,
}: {
  id: ModuleId;
  controller: AppController;
  scheduler: RenderScheduler;
  focus: boolean;
  onFocus: () => void;
  onSettings: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState("");
  const [pin, setPin] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    const unregister = scheduler.register(id, canvas.current);
    return unregister;
  }, [id, scheduler]);
  useEffect(() => {
    setPin(false);
    setTooltip("");
  }, [id, controller.audio.store.resetVersions[id], controller.settings]);
  const inspect = (clientX: number, clientY: number) => {
    const box = canvas.current!.getBoundingClientRect();
    setTooltip(
      scheduler.measure(
        id,
        Math.max(0, Math.min(1, (clientX - box.left - 36) / (box.width - 48))),
        Math.max(0, Math.min(1, (clientY - box.top - 10) / (box.height - 38))),
      ),
    );
  };
  return (
    <section
      className={`module module-${id}${focus ? " focused" : ""}`}
      aria-label={names[id]}
    >
      <header className="module-header">
        <div>
          <h2>{names[id]}</h2>
          <span className="module-subtitle">
            {id === "spectrogram"
              ? "ЧАСТОТА / ВРЕМЯ"
              : id === "waveform"
                ? "АМПЛИТУДА / ВРЕМЯ"
                : id === "stereometer"
                  ? "СТЕРЕОПОЛЕ"
                  : id === "oscilloscope"
                    ? "ФОРМА СИГНАЛА"
                    : "ЧАСТОТА / УРОВЕНЬ"}
          </span>
        </div>
        <div className="module-actions">
          <button
            aria-label={`Настройки ${names[id]}`}
            title="Настройки модуля"
            onClick={onSettings}
          >
            <Icon name="settings" />
          </button>
          <button
            aria-label={`${focus ? "Свернуть" : "Развернуть"} ${names[id]}`}
            title="Фокус"
            onClick={onFocus}
          >
            <Icon name={focus ? "back" : "expand"} />
          </button>
        </div>
      </header>
      <div className="plot-body">
        <canvas
          ref={canvas}
          tabIndex={0}
          role="img"
          aria-label={`${names[id]}. ${descriptions[id]}`}
          onFocus={() => {
            if (!tooltip) setTooltip(descriptions[id]);
          }}
          onPointerMove={(event) => {
            if (!pin) inspect(event.clientX, event.clientY);
          }}
          onPointerLeave={() => {
            if (!pin) setTooltip("");
          }}
          onPointerDown={(event) => {
            inspect(event.clientX, event.clientY);
            setPin(!pin);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setPin(false);
              setTooltip("");
            }
          }}
        />
        {tooltip ? (
          <div
            className="plot-tooltip"
            role="status"
            onClick={() => {
              setPin(false);
              setTooltip("");
            }}
          >
            {tooltip}
          </div>
        ) : null}
      </div>
      <p className="sr-only">
        {descriptions[id]} Уровни измеряются до регулятора громкости.{" "}
        {id === "waveform"
          ? `Текущий RMS: ${controller.audio.store.rms.toFixed(4)}.`
          : id === "stereometer"
            ? `Корреляция: ${controller.audio.store.stereometer?.correlation?.toFixed(3) ?? "не определена"}.`
            : id === "oscilloscope"
              ? `Основная частота: ${controller.audio.store.oscilloscope?.frequency?.toFixed(1) ?? "не определена"} Гц.`
              : `Частота дискретизации ${controller.audio.store.sampleRate} Гц.`}{" "}
        Наведите курсор или коснитесь графика для измерения.
      </p>
    </section>
  );
}
