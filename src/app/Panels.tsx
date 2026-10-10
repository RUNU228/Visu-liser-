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
const transportNames = {
  empty: "Пусто",
  ready: "Готово",
  playing: "Воспроизведение",
  paused: "Пауза",
  interrupted: "Аудио прервано",
  buffering: "Буферизация",
  ended: "Завершено",
  error: "Ошибка",
};
export function ModalPanel({
  title,
  children,
  onClose,
  message,
  transport,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  message?: string;
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
        <button autoFocus aria-label="Закрыть панель" onClick={onClose}>
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
      title={`Очередь · ${c.queue.rows.length}`}
      onClose={onClose}
      message={c.message}
      transport={`${c.queue.active?.title ?? "Дорожка не выбрана"} · ${transportNames[c.audio.state]}`}
    >
      <p className="panel-help">
        Файлы остаются на устройстве. До 100 дорожек, до 250 МиБ на файл.
      </p>
      <div className="panel-toolbar">
        <button onClick={() => c.clear()} disabled={!c.queue.rows.length}>
          Очистить очередь
        </button>
        {c.importer.pending ? (
          <button onClick={() => c.importer.cancel()}>Отменить импорт</button>
        ) : null}
      </div>
      {c.undo ? (
        <button className="undo" onClick={() => c.restoreUndo()}>
          Отменить очистку · 5 с
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
              aria-label={`Перетащить ${track.title}`}
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
                  ? "Подготовка…"
                  : track.status === "failed"
                    ? track.error
                    : `${timeLabel(track.duration)}${track.id === c.queue.activeId ? " · " + (c.audio.intent ? "Воспроизведение" : "Выбрана") : ""}`}
              </span>
              {track.status === "failed" ? (
                <button
                  className="text-action"
                  onClick={() => c.importer.retry(track)}
                >
                  Повторить
                </button>
              ) : null}
            </div>
            <div className="track-actions">
              <button
                aria-label={`Поднять ${track.title}`}
                disabled={index === 0}
                onClick={() => {
                  c.queue.move(track.id, index - 1);
                  c.emit();
                }}
              >
                <Icon name="up" />
              </button>
              <button
                aria-label={`Опустить ${track.title}`}
                disabled={index === c.queue.rows.length - 1}
                onClick={() => {
                  c.queue.move(track.id, index + 1);
                  c.emit();
                }}
              >
                <Icon name="down" />
              </button>
              <button
                aria-label={`Удалить ${track.title}`}
                onClick={() => void c.remove(track.id)}
              >
                <Icon name="trash" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!c.queue.rows.length ? (
        <p className="panel-empty">
          Очередь пуста. Добавьте локальные аудиофайлы.
        </p>
      ) : null}
      {c.importer.duplicates.map((file, index) => (
        <div className="duplicate" key={`${file.name}-${index}`}>
          <p>Возможный дубликат: {file.name}</p>
          <button
            onClick={() => {
              c.importer.duplicates.splice(index, 1);
              c.add([file], true);
            }}
          >
            Добавить ещё раз
          </button>
          <button
            onClick={() => {
              c.importer.duplicates.splice(index, 1);
              c.emit();
            }}
          >
            Пропустить
          </button>
        </div>
      ))}
    </ModalPanel>
  );
}
const groupNames: Record<string, string> = {
  appearance: "Оформление",
  layout: "Композиция",
  analysis: "Анализ",
  performance: "Производительность",
  presets: "Пресеты",
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
            min={control.min}
            max={control.max}
            step={control.step}
            value={value as number}
            aria-valuetext={`${value} ${control.unit}`}
            disabled={disabled}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </>
      )}
    </div>
  );
}
export function SettingsPanel({
  controller: c,
  group,
  onClose,
  onRestore,
}: {
  controller: AppController;
  group: string;
  onClose: () => void;
  onRestore: () => void;
}) {
  const [name, setName] = useState("");
  const [rename, setRename] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLDivElement>(null);
  useEffect(() => {
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
  return (
    <ModalPanel
      title="Настройки"
      onClose={onClose}
      message={c.message}
      transport={`${c.queue.active?.title ?? "Дорожка не выбрана"} · ${transportNames[c.audio.state]}`}
    >
      <div ref={section}>
        <nav className="settings-nav" aria-label="Группы настроек">
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
                    label: "Расположение",
                    kind: "select",
                    options: [
                      ["composition", "Композиция"],
                      ["strip", "Полоса · от 1440 px"],
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
                        aria-label={`Поднять ${names[id]}`}
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
                        aria-label={`Опустить ${names[id]}`}
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
                  Восстановить композицию
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
                Громкость и отключение звука меняют только выход. Визуальный
                уровень не меняет музыку. M=(L+R)/2; S=(L−R)/2. Частота:{" "}
                {diagnostic.sampleRate} Гц.
              </p>
            ) : null}
            {section === "performance" ? (
              <div className="diagnostics">
                <p>
                  Авто: 60 FPS на компьютере, 30 FPS на мобильном. Экономный
                  режим: 30 FPS / DPR ≤1.5.
                </p>
                <p>
                  {diagnostic.primary
                    ? "AudioWorklet + Worker"
                    : "Анализ ещё не запущен / резервный режим"}
                  <br />
                  Память: {(diagnostic.reservedBytes / 1024 ** 2).toFixed(1)} /
                  64 МиБ
                  <br />
                  Спектральных полос: {diagnostic.buckets}
                  <br />
                  Задержка p95: {diagnostic.latencyP95.toFixed(1)} мс
                  <br />
                  Центр FFT p95: {diagnostic.centerAgeP95.toFixed(1)} мс
                  <br />
                  Выход устройства: {(diagnostic.baseLatency * 1000).toFixed(
                    1,
                  )}{" "}
                  мс
                  <br />
                  Разрывы истории: {diagnostic.gaps}
                </p>
              </div>
            ) : null}
            {section === "waveform" || section === "spectrogram" ? (
              <p className="panel-help">
                История: {effectiveDuration(c.settings, section).toFixed(2)} с
                сыгранного потока. При 2× это вдвое больше времени файла.
              </p>
            ) : null}
            {section === "waveform" || section === "stereometer" ? (
              <p className="panel-help">
                Частотные слои: плотный низ &lt;200 Гц, тонкая середина 200–2000
                Гц, точки верха &gt;2000 Гц. Они дополняют исходный сигнал.
              </p>
            ) : null}
            {section === "oscilloscope" ? (
              <p className="panel-help">
                Тон определяется по периодичности PCM. Для противофазного стерео
                выбирайте L или R. При неопределённом тоне используется
                свободное окно.
              </p>
            ) : null}
            {section === "spectrum" ? (
              <p className="panel-help">
                Уровни калиброваны по пиковой амплитуде синусоиды в центре
                FFT-бина. Нота подписывает частоту, не тональность композиции.
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
                  Имя пресета
                  <input
                    value={name}
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Мой пресет"
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
                  Сохранить пресет
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
                          aria-label="Новое имя пресета"
                          autoFocus
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                        />
                        <button>Сохранить имя</button>
                      </form>
                    ) : (
                      <>
                        <button onClick={() => c.setSettings(p.settings)}>
                          {p.name}
                        </button>
                        <button
                          aria-label={`Переименовать ${p.name}`}
                          onClick={() => {
                            setRename(p.id);
                            setName(p.name);
                          }}
                        >
                          Имя
                        </button>
                        <button
                          aria-label={`Удалить пресет ${p.name}`}
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
                    Импорт JSON
                  </button>
                  <button onClick={() => exportPreset(c.settings)}>
                    Экспорт JSON
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
                        throw new Error("Файл настроек превышает 64 КиБ.");
                      const parsed = parsePreset(await preset.text());
                      c.setSettings(parsed);
                    } catch (error) {
                      c.notify(
                        error instanceof Error
                          ? error.message
                          : "Неверный JSON.",
                      );
                    }
                    input.value = "";
                  }}
                />
                <p className="panel-help">
                  Пресеты меняют только оформление и анализ. Очередь и
                  воспроизведение сохраняются.
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
          Сбросить все настройки
        </button>
        <p className="panel-help">Очередь, позиция и громкость сохранятся.</p>
      </div>
    </ModalPanel>
  );
}
