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
  spectrogram: "Frequency and spectral level history of the signal.",
  waveform: "Minimum, maximum, and energy of audio samples over time.",
  stereometer:
    "Synchronized left and right channels, M/S geometry, and correlation.",
  oscilloscope:
    "Short window of the actual signal with triggering and pitch detection.",
  spectrum: "Current spectral level in dBFS and frequency in hertz.",
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
              ? "Frequency / time"
              : id === "waveform"
                ? "Amplitude / time"
                : id === "stereometer"
                  ? "Stereo field"
                  : id === "oscilloscope"
                    ? "Signal shape"
                    : "Frequency / level"}
          </span>
        </div>
        <div className="module-actions">
          <button
            aria-label={`Settings ${names[id]}`}
            title={`Settings ${names[id]}`}
            onClick={onSettings}
          >
            <Icon name="settings" />
          </button>
          <button
            aria-label={`${focus ? "Collapse" : "Expand"} ${names[id]}`}
            title={`${focus ? "Collapse" : "Expand"} ${names[id]}`}
            aria-pressed={focus}
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
        {descriptions[id]} Levels are measured before the volume control.{" "}
        {id === "waveform"
          ? `Current RMS: ${controller.audio.store.rms.toFixed(4)}.`
          : id === "stereometer"
            ? `Correlation: ${controller.audio.store.stereometer?.correlation?.toFixed(3) ?? "unavailable"}.`
            : id === "oscilloscope"
              ? `Fundamental frequency: ${controller.audio.store.oscilloscope?.frequency?.toFixed(1) ?? "unavailable"} Hz.`
              : `Sample rate ${controller.audio.store.sampleRate} Hz.`}{" "}
        Point at or touch the plot to inspect a measurement.
      </p>
    </section>
  );
}
