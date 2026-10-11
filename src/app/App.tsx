import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { AppController } from "./controller";
import { RenderScheduler } from "../visualizers/scheduler";
import { Plot } from "./Plot";
import { QueuePanel, SettingsPanel } from "./Panels";
import { Icon, Logo } from "./icons";
import { AUDIO_ACCEPT } from "../player/importer";
import { type ModuleId } from "../shared/types";
import { timeLabel } from "../shared/units";
import { stateNames, repeatNames } from "./copy";
const stripWeights: Record<ModuleId, number> = {
  spectrogram: 28,
  waveform: 22,
  stereometer: 7,
  oscilloscope: 16,
  spectrum: 27,
};
export function App({
  controller: c,
  scheduler,
}: {
  controller: AppController;
  scheduler: RenderScheduler;
}) {
  useSyncExternalStore(c.subscribe, c.snapshot);
  const [panel, setPanel] = useState<"queue" | "settings" | null>(null),
    [group, setGroup] = useState("appearance"),
    [focus, setFocus] = useState<ModuleId | null>(null),
    [dragging, setDragging] = useState(false),
    [seekPreview, setSeekPreview] = useState<number | null>(null),
    [width, setWidth] = useState(innerWidth);
  const input = useRef<HTMLInputElement>(null),
    workspace = useRef<HTMLElement>(null),
    dragDepth = useRef(0);
  const s = c.settings,
    active = c.queue.active;
  const visible = s.layout.order.filter((id) => s.layout.enabled[id]);
  const strip = s.layout.requested === "strip" && width >= 1440 && !focus;
  const elapsed = seekPreview ?? c.audio.media.currentTime;
  const duration = active?.duration ?? 0;
  const playAction =
    c.audio.intent && c.audio.state !== "interrupted" ? "Pause" : "Play";
  const muteAction = c.audio.muted ? "Unmute" : "Mute";
  const themeAction =
    s.appearance.theme === "light"
      ? "Switch to dark theme"
      : "Switch to light theme";
  const repeatLabel = `Repeat: ${repeatNames[c.queue.repeat]}`;
  useEffect(() => {
    const resize = () => setWidth(innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = s.appearance.theme;
    document.documentElement.dataset.decoration = s.appearance.decoration;
    document.documentElement.dataset.lighting = String(s.appearance.lighting);
    scheduler.invalidate();
  }, [s, scheduler]);
  useEffect(() => {
    scheduler.focus = focus;
    scheduler.invalidate();
  }, [focus, scheduler]);
  useEffect(() => {
    if (focus && !s.layout.enabled[focus]) setFocus(null);
  }, [focus, s.layout.enabled]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "Escape") {
        if (panel) setPanel(null);
        else {
          const popover = document.getElementById("mobile-player-options");
          if (popover?.matches(":popover-open")) popover.hidePopover();
          else setFocus(null);
        }
        return;
      }
      if (
        target.closest(
          'input,textarea,select,button,summary,[contenteditable="true"]',
        )
      )
        return;
      if (panel) return;
      const key = event.key.toLowerCase();
      if (event.code === "Space") {
        event.preventDefault();
        c.togglePlay();
      }
      if (key === "arrowleft" || key === "arrowright") {
        event.preventDefault();
        void c.audio.seek(
          c.audio.media.currentTime +
            (key === "arrowright" ? 1 : -1) * (event.shiftKey ? 15 : 5),
        );
      }
      if (key === "m") c.audio.setVolume(c.audio.volume, !c.audio.muted);
      if (key === "q") setPanel("queue");
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [c, panel]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const event = () => {
      if (
        s.appearance.decoration !== "off" &&
        s.appearance.glitch &&
        !document.hidden &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        document.documentElement.classList.add("glitch-event");
        setTimeout(
          () => document.documentElement.classList.remove("glitch-event"),
          100,
        );
      }
      timer = setTimeout(event, 8000 + Math.random() * 10000);
    };
    timer = setTimeout(event, 8000 + Math.random() * 10000);
    return () => {
      clearTimeout(timer);
      document.documentElement.classList.remove("glitch-event");
    };
  }, [s.appearance.decoration, s.appearance.glitch]);
  const openSettings = (id: string) => {
    setGroup(id);
    setPanel("settings");
  };
  const slot = (id: ModuleId, index: number): CSSProperties => {
    if (focus) return { width: "100%" };
    if (strip) return { flexBasis: 0, flexGrow: stripWeights[id] };
    if (width >= 1200) {
      const top = index < 2;
      const weights = top ? [55, 45] : [20, 35, 45];
      const offset = top ? 0 : 2;
      const row = visible.slice(offset, top ? 2 : 5);
      const sum = row.reduce((total, _, i) => total + weights[i], 0);
      return {
        width: `calc(${(weights[index - offset] / sum) * 100}% - ${row.length > 1 ? (16 * (row.length - 1)) / row.length : 0}px)`,
      };
    }
    return {};
  };
  const commitSeek = () => {
    if (seekPreview !== null) {
      void c.audio.seek(seekPreview);
      setSeekPreview(null);
    }
  };
  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <div
        className="page"
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            dragDepth.current++;
            setDragging(true);
          }
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files"))
            event.preventDefault();
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length) {
            event.preventDefault();
            c.add(Array.from(event.dataTransfer.files));
          }
          dragDepth.current = 0;
          setDragging(false);
        }}
      >
        <header className="topbar">
          <Logo />
          <div className="top-actions">
            <button
              className="add-button"
              aria-label="Add audio"
              onClick={() => input.current?.click()}
            >
              <Icon name="plus" />
              <span>Add audio</span>
            </button>
            <button
              aria-label={themeAction}
              title={themeAction}
              onClick={() => {
                const next = structuredClone(s);
                next.appearance.theme =
                  s.appearance.theme === "light" ? "dark" : "light";
                c.setSettings(next);
              }}
            >
              <Icon name={s.appearance.theme === "light" ? "moon" : "sun"} />
            </button>
            <button
              aria-label="Settings"
              title="Settings"
              onClick={() => openSettings("appearance")}
            >
              <Icon name="settings" />
            </button>
          </div>
        </header>
        <input
          type="file"
          ref={input}
          accept={AUDIO_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) c.add(Array.from(event.target.files));
            event.target.value = "";
          }}
        />
        <main>
          <div className="workspace-toolbar">
            <span className="workspace-state">
              <span
                className={`state-dot${c.audio.intent ? " is-playing" : ""}`}
              />
              {stateNames[c.audio.state]}
              {c.audio.frozen ? " · plots frozen" : ""}
            </span>
            <div>
              <button
                className="text-action"
                aria-pressed={c.audio.frozen}
                aria-label={c.audio.frozen ? "Unfreeze" : "Freeze"}
                onClick={() => c.audio.setFrozen(!c.audio.frozen)}
              >
                <Icon name="freeze" />
                <span>{c.audio.frozen ? "Unfreeze" : "Freeze"}</span>
              </button>
              <button
                className="text-action fullscreen"
                aria-label="Fullscreen"
                title="Fullscreen"
                onClick={async () => {
                  try {
                    if (document.fullscreenElement)
                      await document.exitFullscreen();
                    else if (workspace.current?.requestFullscreen)
                      await workspace.current.requestFullscreen();
                    else
                      c.notify(
                        "Fullscreen is unavailable. Expand a visualizer instead.",
                      );
                  } catch {
                    c.notify(
                      "Fullscreen is unavailable. Expand a visualizer instead.",
                    );
                  }
                }}
              >
                <Icon name="expand" />
                <span>Fullscreen</span>
              </button>
            </div>
          </div>
          <section
            ref={workspace}
            className={`workspace${strip ? " strip" : ""}${focus ? " focus-mode" : ""}${dragging ? " drag-active" : ""}`}
            aria-label="Audio visualizers"
          >
            {!c.queue.rows.length && visible.length ? (
              <div className="empty-import">
                <button onClick={() => input.current?.click()}>
                  <Icon name="plus" />
                  <span>Add audio</span>
                </button>
                <p>or drag files here</p>
                <small>MP3 · PCM WAV · other browser-supported formats</small>
              </div>
            ) : null}
            {(focus && s.layout.enabled[focus] ? [focus] : visible).map(
              (id, index) => (
                <div className="module-slot" key={id} style={slot(id, index)}>
                  <Plot
                    id={id}
                    controller={c}
                    scheduler={scheduler}
                    focus={focus === id}
                    onFocus={() => setFocus(focus === id ? null : id)}
                    onSettings={() => openSettings(id)}
                  />
                </div>
              ),
            )}
            {!visible.length ? (
              <div className="all-hidden">
                <p>All visualizers are hidden</p>
                <button
                  onClick={() => {
                    const next = structuredClone(s);
                    for (const id of next.layout.order)
                      next.layout.enabled[id] = true;
                    c.setSettings(next);
                    setFocus(null);
                  }}
                >
                  Show visualizers
                </button>
              </div>
            ) : null}
            {dragging ? (
              <div className="drop-hint" aria-live="polite">
                Drop to add audio
              </div>
            ) : null}
          </section>
          {c.audio.store.error ? (
            <div className="analysis-notice">
              <span>
                {c.audio.store.error}{" "}
                {c.audio.store.fallback
                  ? "Stereometer is unavailable. Other plots use mono / Free / limited AnalyserNode history."
                  : ""}
              </span>
              <button onClick={() => void c.audio.retryAnalysis()}>
                Retry analysis
              </button>
            </div>
          ) : null}
          <section className="player" aria-label="Audio player">
            <span
              className="sr-only"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {active?.title ?? "No track selected"} ·{" "}
              {stateNames[c.audio.state]}
            </span>
            <div className="transport">
              <button
                aria-label="Previous track"
                title="Previous track"
                disabled={!active}
                onClick={() => c.previous()}
              >
                <Icon name="prev" />
              </button>
              <button
                className="play-button"
                aria-label={playAction}
                title={`${playAction} · Space`}
                disabled={!active}
                onClick={() => c.togglePlay()}
              >
                <Icon
                  name={
                    c.audio.intent && c.audio.state !== "interrupted"
                      ? "pause"
                      : "play"
                  }
                />
              </button>
              <button
                aria-label="Next track"
                title="Next track"
                disabled={!active}
                onClick={() => c.advance()}
              >
                <Icon name="next" />
              </button>
            </div>
            <div className="track-info">
              <strong title={active?.title} aria-label={active?.title}>
                {active?.title ?? "No track selected"}
              </strong>
              <span>
                {active
                  ? "Local audio file"
                  : "Your music stays on this device"}
              </span>
            </div>
            <div className="seek">
              <div className="time-row">
                <output>{timeLabel(elapsed)}</output>
                <output>{timeLabel(duration)}</output>
              </div>
              <input
                type="range"
                aria-label="Playback position"
                aria-valuetext={`${timeLabel(elapsed)} of ${timeLabel(duration)}`}
                min={0}
                max={duration || 1}
                step={0.1}
                value={Math.min(duration || 1, elapsed || 0)}
                disabled={!active}
                onChange={(event) => setSeekPreview(Number(event.target.value))}
                onPointerUp={commitSeek}
                onPointerCancel={() => setSeekPreview(null)}
                onKeyUp={(event) => {
                  if (
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                      "Home",
                      "End",
                      "PageUp",
                      "PageDown",
                    ].includes(event.key)
                  )
                    commitSeek();
                }}
                onBlur={commitSeek}
              />
            </div>
            <div className="player-options">
              <button
                aria-label={repeatLabel}
                title={repeatLabel}
                aria-pressed={c.queue.repeat !== "off"}
                className={c.queue.repeat !== "off" ? "selected" : ""}
                onClick={() => {
                  c.queue.repeat =
                    c.queue.repeat === "off"
                      ? "queue"
                      : c.queue.repeat === "queue"
                        ? "one"
                        : "off";
                  c.emit();
                }}
              >
                <Icon name="repeat" />
                {c.queue.repeat === "one" ? <sup>1</sup> : null}
              </button>
              <button
                aria-label="Shuffle"
                title="Shuffle"
                aria-pressed={c.queue.shuffle}
                className={c.queue.shuffle ? "selected" : ""}
                onClick={() => {
                  c.queue.setShuffle(!c.queue.shuffle);
                  c.emit();
                }}
              >
                <Icon name="shuffle" />
              </button>
              <select
                aria-label="Playback speed"
                value={c.audio.rate}
                onChange={(event) =>
                  void c.audio.setRate(Number(event.target.value))
                }
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>
            </div>
            <div className="volume">
              <button
                aria-label={muteAction}
                title={`${muteAction} · M`}
                onClick={() =>
                  c.audio.setVolume(c.audio.volume, !c.audio.muted)
                }
              >
                <Icon
                  name={c.audio.muted || !c.audio.volume ? "mute" : "volume"}
                />
              </button>
              <input
                type="range"
                aria-label="Volume"
                min={0}
                max={100}
                step={1}
                value={Math.round(c.audio.volume * 100)}
                aria-valuetext={`${Math.round(c.audio.volume * 100)}%`}
                onChange={(event) =>
                  c.audio.setVolume(Number(event.target.value) / 100)
                }
              />
            </div>
            <button
              className="queue-button"
              aria-label={`Queue, ${c.queue.rows.length} track${c.queue.rows.length === 1 ? "" : "s"}`}
              onClick={() => setPanel("queue")}
            >
              <Icon name="queue" />
              <span>{c.queue.rows.length}</span>
            </button>
            <button
              className="mobile-more"
              popoverTarget="mobile-player-options"
              aria-label="More player options"
            >
              <Icon name="settings" />
            </button>
          </section>
          <div className="status-line">
            <span role="status" aria-live="polite">
              {c.message}
            </span>
            {c.messageDismissible ? (
              <button
                className="text-action"
                aria-label="Dismiss notice"
                onClick={() => c.dismissNotice()}
              >
                Dismiss
              </button>
            ) : null}
            {c.undo ? (
              <button className="text-action" onClick={() => c.restoreUndo()}>
                Undo clear
              </button>
            ) : null}
            {c.importer.pending ? (
              <button
                className="text-action"
                onClick={() => c.importer.cancel()}
              >
                Cancel import
              </button>
            ) : null}
          </div>
        </main>
        <footer className="page-footer">
          <span>Visu@lizer</span>
          <span>Local sound. Visible signal.</span>
          <span>MP3 / WAV · ≤250 MiB · 100 tracks</span>
        </footer>
      </div>
      <div id="mobile-player-options" popover="auto" className="player-popover">
        <p>Player options</p>
        <label>
          Speed
          <select
            aria-label="Mobile playback speed"
            value={c.audio.rate}
            onChange={(event) =>
              void c.audio.setRate(Number(event.target.value))
            }
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </label>
        <button
          aria-pressed={c.queue.repeat !== "off"}
          onClick={() => {
            c.queue.repeat =
              c.queue.repeat === "off"
                ? "queue"
                : c.queue.repeat === "queue"
                  ? "one"
                  : "off";
            c.emit();
          }}
        >
          {repeatLabel}
        </button>
        <button
          aria-pressed={c.queue.shuffle}
          onClick={() => {
            c.queue.setShuffle(!c.queue.shuffle);
            c.emit();
          }}
        >
          Shuffle
        </button>
      </div>
      {panel === "queue" ? (
        <QueuePanel controller={c} onClose={() => setPanel(null)} />
      ) : panel === "settings" ? (
        <SettingsPanel
          controller={c}
          scheduler={scheduler}
          group={group}
          onClose={() => setPanel(null)}
          onRestore={() => setFocus(null)}
        />
      ) : null}
    </>
  );
}
