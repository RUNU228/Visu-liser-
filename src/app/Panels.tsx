import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { AppController } from "./controller";
import {
  controls,
  builtinPresets,
  linkTime,
  defaults,
  effectiveDuration,
  type Control,
} from "../settings/schema";
import { parsePreset, exportPreset } from "../settings/storage";
import { MODULES, type ModuleId, type Settings } from "../shared/types";
import { timeLabel } from "../shared/units";
import { Icon } from "./icons";
import { names } from "./Plot";
import type { RenderScheduler } from "../visualizers/scheduler";
import { stateNames as transportNames } from "./copy";
export function ModalPanel({
  title,
  children,
  onClose,
  message,
  onDismiss,
  transport,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  message?: string;
  onDismiss?: () => void;
  transport?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("button")?.focus();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="side-panel"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header className="panel-header">
        <h2>{title}</h2>
        <button autoFocus aria-label="Close panel" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="panel-scroll">
        <span
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {transport}
        </span>
        <p
          className="panel-help"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {message}
          {message && onDismiss ? (
            <button
              className="text-action"
              aria-label="Dismiss notice"
              onClick={onDismiss}
            >
              Dismiss
            </button>
          ) : null}
        </p>
        {children}
      </div>
    </dialog>
  );
}
export function QueuePanel({
  controller: c,
  onClose,
}: {
  controller: AppController;
  onClose: () => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  return (
    <ModalPanel
      title={`Queue · ${c.queue.rows.length}`}
      onClose={onClose}
      message={c.message}
      onDismiss={c.messageDismissible ? () => c.dismissNotice() : undefined}
      transport={`${c.queue.active?.title ?? "No track selected"} · ${transportNames[c.audio.state]}`}
    >
      <p className="panel-help">
        Files stay on this device. Up to 100 tracks, 250 MiB per file.
      </p>
      <div className="panel-toolbar">
        <button onClick={() => c.clear()} disabled={!c.queue.rows.length}>
          Clear queue
        </button>
        {c.importer.pending ? (
          <button onClick={() => c.importer.cancel()}>Cancel import</button>
        ) : null}
      </div>
      {c.undo ? (
        <button className="undo" onClick={() => c.restoreUndo()}>
          Undo clear · 5 s
        </button>
      ) : null}
      <ol className="track-list">
        {c.queue.rows.map((track, index) => (
          <li
            key={track.id}
            className={track.id === c.queue.activeId ? "active-track" : ""}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged) {
                c.queue.move(dragged, index);
                c.emit();
              }
              setDragged(null);
            }}
          >
            <button
              className="drag-handle"
              draggable
              aria-label={`Drag ${track.title}`}
              onDragStart={(event) => {
                setDragged(track.id);
                event.dataTransfer.setData("text/plain", track.id);
              }}
            >
              <Icon name="drag" />
            </button>
            <div className="track-main">
              <button
                className="track-select"
                disabled={track.status !== "ready"}
                onClick={() => c.select(track.id)}
                aria-current={
                  track.id === c.queue.activeId ? "true" : undefined
                }
              >
                <span className="track-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="track-title">{track.title}</span>
              </button>
              <span className="track-meta">
                {track.status === "pending"
                  ? "Preparing…"
                  : track.status === "failed"
                    ? track.error
                    : `${timeLabel(track.duration)}${track.id === c.queue.activeId ? " · " + (c.audio.intent ? "Playing" : "Selected") : ""}`}
              </span>
              {track.status === "failed" ? (
                <button
                  className="text-action"
                  onClick={() => c.importer.retry(track)}
                >
                  Retry
                </button>
              ) : null}
            </div>
            <div className="track-actions">
              <button
                aria-label={`Move up ${track.title}`}
                disabled={index === 0}
                onClick={() => {
                  c.queue.move(track.id, index - 1);
                  c.emit();
                }}
              >
                <Icon name="up" />
              </button>
              <button
                aria-label={`Move down ${track.title}`}
                disabled={index === c.queue.rows.length - 1}
                onClick={() => {
                  c.queue.move(track.id, index + 1);
                  c.emit();
                }}
              >
                <Icon name="down" />
              </button>
              <button
                aria-label={`Remove ${track.title}`}
                onClick={() => void c.remove(track.id)}
              >
                <Icon name="trash" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!c.queue.rows.length ? (
        <p className="panel-empty">Queue is empty. Add local audio files.</p>
      ) : null}
      {c.importer.duplicates.map((file, index) => (
        <div className="duplicate" key={`${file.name}-${index}`}>
          <p>Possible duplicate: {file.name}</p>
          <button
            onClick={() => {
              c.importer.duplicates.splice(index, 1);
              c.add([file], true);
            }}
          >
            Add again
          </button>
          <button
            onClick={() => {
              c.importer.duplicates.splice(index, 1);
              if (!c.importer.duplicates.length) c.dismissNotice();
              else c.emit();
            }}
          >
            Skip
          </button>
        </div>
      ))}
    </ModalPanel>
  );
}
const groupNames: Record<string, string> = {
  appearance: "Appearance",
  layout: "Composition",
  analysis: "Analysis",
  performance: "Performance",
  presets: "Presets",
  spectrogram: "Spectrogram",
  waveform: "Waveform",
  stereometer: "Stereometer",
  oscilloscope: "Oscilloscope",
  spectrum: "Spectrum",
};
function Field({
  control,
  value,
  disabled,
  onChange,
}: {
  control: Control;
  value: unknown;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  // Keep accepted fractional import values in the discrete control until edited.
  const sliderValues =
    control.values &&
    typeof value === "number" &&
    !control.values.includes(value)
      ? [...control.values, value].sort((a, b) => a - b)
      : control.values;
  if (control.kind === "boolean")
    return (
      <label className={`check-field${disabled ? " field-disabled" : ""}`}>
        <span>{control.label}</span>
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  return (
    <div className={`field${disabled ? " field-disabled" : ""}`}>
      <label htmlFor={id}>{control.label}</label>
      {control.kind === "select" ? (
        <select
          id={id}
          value={String(value)}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              control.options!.find(
                ([v]) => String(v) === event.target.value,
              )![0],
            )
          }
        >
          {control.options!.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <output htmlFor={id}>
            {String(value)} {control.unit}
          </output>
          <input
            id={id}
            type="range"
            min={sliderValues ? 0 : control.min}
            max={sliderValues ? sliderValues.length - 1 : control.max}
            step={sliderValues ? 1 : control.step}
            value={
              sliderValues
                ? sliderValues.indexOf(value as number)
                : (value as number)
            }
            aria-valuetext={`${value} ${control.unit}`}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                sliderValues?.[Number(event.target.value)] ??
                  Number(event.target.value),
              )
            }
          />
        </>
      )}
    </div>
  );
}
export function SettingsPanel({
  controller: c,
  scheduler,
  group,
  onClose,
  onRestore,
}: {
  controller: AppController;
  scheduler: RenderScheduler;
  group: string;
  onClose: () => void;
  onRestore: () => void;
}) {
  const [name, setName] = useState("");
  const [rename, setRename] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (group === "appearance") return;
    section.current
      ?.querySelector(`[data-group="${group}"]`)
      ?.scrollIntoView({ block: "start" });
  }, [group]);
  const change = (section: string, key: string, value: unknown) => {
    if (section === "analysis" && key === "linked") {
      c.setSettings(linkTime(c.settings, value === true));
      return;
    }
    const next = structuredClone(c.settings);
    (next[section as keyof Settings] as unknown as Record<string, unknown>)[
      key
    ] = value;
    c.setSettings(next);
  };
  const diagnostic = c.audio.diagnostics;
  const effective = scheduler.effective;
  return (
    <ModalPanel
      title="Settings"
      onClose={onClose}
      message={c.message}
      onDismiss={c.messageDismissible ? () => c.dismissNotice() : undefined}
      transport={`${c.queue.active?.title ?? "No track selected"} · ${transportNames[c.audio.state]}`}
    >
      <div ref={section}>
        <nav className="settings-nav" aria-label="Settings groups">
          {Object.entries(groupNames).map(([key, label]) => (
            <button
              key={key}
              onClick={() =>
                section.current
                  ?.querySelector(`[data-group="${key}"]`)
                  ?.scrollIntoView({
                    block: "start",
                    behavior: matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                      ? "instant"
                      : "smooth",
                  })
              }
            >
              {label}
            </button>
          ))}
        </nav>
        {[
          "appearance",
          "layout",
          "analysis",
          "performance",
          "presets",
          ...MODULES,
        ].map((section) => (
          <section
            className="settings-group"
            data-group={section}
            key={section}
          >
            <h3>{groupNames[section]}</h3>
            {section === "layout" ? (
              <>
                <Field
                  control={{
                    key: "requested",
                    label: "Layout",
                    kind: "select",
                    options: [
                      ["composition", "Composition"],
                      ["strip", "Strip · from 1440 px"],
                    ],
                  }}
                  value={c.settings.layout.requested}
                  onChange={(value) => {
                    const next = structuredClone(c.settings);
                    next.layout.requested = value as "composition" | "strip";
                    c.setSettings(next);
                  }}
                />
                <div className="module-list">
                  {c.settings.layout.order.map((id, index) => (
                    <div className="module-order" key={id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={c.settings.layout.enabled[id]}
                          onChange={(event) => {
                            const next = structuredClone(c.settings);
                            next.layout.enabled[id] = event.target.checked;
                            c.setSettings(next);
                          }}
                        />
                        {names[id]}
                      </label>
                      <button
                        aria-label={`Move up ${names[id]}`}
                        disabled={index === 0}
                        onClick={() => {
                          const next = structuredClone(c.settings);
                          [
                            next.layout.order[index - 1],
                            next.layout.order[index],
                          ] = [
                            next.layout.order[index],
                            next.layout.order[index - 1],
                          ];
                          c.setSettings(next);
                        }}
                      >
                        <Icon name="up" />
                      </button>
                      <button
                        aria-label={`Move down ${names[id]}`}
                        disabled={index === 4}
                        onClick={() => {
                          const next = structuredClone(c.settings);
                          [
                            next.layout.order[index + 1],
                            next.layout.order[index],
                          ] = [
                            next.layout.order[index],
                            next.layout.order[index + 1],
                          ];
                          c.setSettings(next);
                        }}
                      >
                        <Icon name="down" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="wide-action"
                  onClick={() => {
                    const next = structuredClone(c.settings);
                    next.layout = defaults().layout;
                    c.setSettings(next);
                    onRestore();
                  }}
                >
                  Restore composition
                </button>
              </>
            ) : null}
            {controls[section]?.map((control) => (
              <Field
                key={control.key}
                control={control}
                value={
                  (
                    c.settings[section as keyof Settings] as unknown as Record<
                      string,
                      unknown
                    >
                  )[control.key]
                }
                disabled={
                  ((section === "waveform" || section === "spectrogram") &&
                    c.settings.analysis.linked &&
                    ["duration", "speed"].includes(control.key)) ||
                  (section === "analysis" &&
                    control.key === "sharedDuration" &&
                    !c.settings.analysis.linked)
                }
                onChange={(value) => change(section, control.key, value)}
              />
            ))}
            {section === "analysis" ? (
              <p className="panel-help">
                Volume and mute affect only the output. Visual level does not
                change the music. M=(L+R)/2; S=(L−R)/2. Sample rate:{" "}
                {diagnostic.sampleRate} Hz.
              </p>
            ) : null}
            {section === "performance" ? (
              <div className="diagnostics">
                <p>
                  Target frame rate: {effective.fps} FPS
                  <br />
                  Effective DPR: {effective.dpr}
                  <br />
                  {effective.reasons.join(" · ")}
                  <br />
                  Measured frame rate:{" "}
                  {diagnostic.fps
                    ? `${diagnostic.fps.toFixed(1)} FPS`
                    : "no data"}
                  <br />
                  Idle redraw p95: {diagnostic.idleRenderP95.toFixed(1)} ms
                </p>
                <p>
                  Auto: 60 FPS on desktop, 30 FPS on mobile. Economy mode: 30
                  FPS / DPR ≤1.5.
                </p>
                <p>
                  {diagnostic.primary
                    ? "AudioWorklet + Worker"
                    : "Analysis not started / fallback mode"}
                  <br />
                  Memory: {(diagnostic.reservedBytes / 1024 ** 2).toFixed(1)} /
                  64 MiB
                  <br />
                  Spectral buckets: {diagnostic.buckets}
                  <br />
                  Latency p95: {diagnostic.latencyP95.toFixed(1)} ms
                  <br />
                  FFT center age p95: {diagnostic.centerAgeP95.toFixed(1)} ms
                  <br />
                  Device output: {(diagnostic.baseLatency * 1000).toFixed(1)} ms
                  <br />
                  History gaps: {diagnostic.gaps}
                </p>
              </div>
            ) : null}
            {section === "waveform" || section === "spectrogram" ? (
              <p className="panel-help">
                History: {effectiveDuration(c.settings, section).toFixed(2)} s
                of played signal. At 2×, this covers twice as much file time.
              </p>
            ) : null}
            {section === "waveform" || section === "stereometer" ? (
              <p className="panel-help">
                Frequency layers: solid lows &lt;200 Hz, thin mids 200–2000 Hz,
                dotted highs &gt;2000 Hz. They supplement the raw signal.
              </p>
            ) : null}
            {section === "oscilloscope" ? (
              <p className="panel-help">
                Pitch is detected from PCM periodicity. For anti-phase stereo,
                choose L or R. When pitch is uncertain, a free window is used.
              </p>
            ) : null}
            {section === "spectrum" ? (
              <p className="panel-help">
                Levels are calibrated to the peak amplitude of a sine at an FFT
                bin center. The note labels frequency, not the track key.
              </p>
            ) : null}
            {section === "presets" ? (
              <>
                <div className="builtin-presets">
                  {Object.entries(builtinPresets()).map(([label, settings]) => (
                    <button key={label} onClick={() => c.setSettings(settings)}>
                      {label}
                    </button>
                  ))}
                </div>
                <label className="preset-name">
                  Preset name
                  <input
                    value={name}
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="My preset"
                  />
                </label>
                <button
                  className="wide-action"
                  disabled={!name.trim()}
                  onClick={() => {
                    c.savePreset(name);
                    setName("");
                  }}
                >
                  Save preset
                </button>
                {c.presets.map((p) => (
                  <div className="user-preset" key={p.id}>
                    {rename === p.id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          c.renamePreset(p.id, name);
                          setRename("");
                          setName("");
                        }}
                      >
                        <input
                          aria-label="New preset name"
                          autoFocus
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                        />
                        <button>Save name</button>
                      </form>
                    ) : (
                      <>
                        <button onClick={() => c.setSettings(p.settings)}>
                          {p.name}
                        </button>
                        <button
                          aria-label={`Rename ${p.name}`}
                          onClick={() => {
                            setRename(p.id);
                            setName(p.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          aria-label={`Delete preset ${p.name}`}
                          onClick={() => c.deletePreset(p.id)}
                        >
                          <Icon name="trash" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                <div className="panel-toolbar">
                  <button onClick={() => file.current?.click()}>
                    Import JSON
                  </button>
                  <button onClick={() => exportPreset(c.settings)}>
                    Export JSON
                  </button>
                </div>
                <input
                  ref={file}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const preset = input.files?.[0];
                    if (!preset) return;
                    try {
                      if (preset.size > 65536)
                        throw new Error("Settings file exceeds 64 KiB.");
                      const parsed = parsePreset(await preset.text());
                      c.setSettings(parsed);
                    } catch (error) {
                      c.notify(
                        error instanceof Error
                          ? error.message
                          : "Invalid JSON.",
                      );
                    }
                    input.value = "";
                  }}
                />
                <p className="panel-help">
                  Presets change only appearance and analysis. Queue and
                  playback are preserved.
                </p>
              </>
            ) : null}
          </section>
        ))}
        <button
          className="wide-action"
          onClick={() => {
            c.resetSettings();
            onRestore();
          }}
        >
          Reset all settings
        </button>
        <p className="panel-help">Queue, position, and volume are preserved.</p>
      </div>
    </ModalPanel>
  );
}
