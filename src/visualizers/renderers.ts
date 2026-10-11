import type { Settings, ModuleId, WaveBucket } from "../shared/types";
import { effectiveDuration } from "../settings/schema";
import {
  clamp,
  frequencyLabel,
  frequencyPosition,
  positionFrequency,
  spectralDb,
  levelDb,
  noteLabel,
  timeLabel,
} from "../shared/units";
import type { AnalysisStore } from "./store";
import {
  historyPosition,
  historyTime,
  historySpans,
  pointOpacity,
  projectWaveform,
  scopeExtrema,
  spectralPixel,
} from "./geometry";
export interface PlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  settings: Settings;
  store: AnalysisStore;
  dark: boolean;
  rect: PlotRect;
  ink: string;
  muted: string;
  divider: string;
}
export interface Measurement {
  text: string;
  x: number;
  y: number;
}
function waveLanes(s: Settings, height: number) {
  const lanes =
    s.waveform.lane2 === "off"
      ? [s.waveform.lane1]
      : [s.waveform.lane1, s.waveform.lane2];
  const mainHeight = Math.max(
    0,
    height - (s.waveform.bandHistory === "off" ? 0 : 28),
  );
  return { lanes, mainHeight, laneHeight: mainHeight / lanes.length };
}
function stereoGain(s: Settings, autoGain = 1) {
  return (
    s.stereometer.gain *
    10 ** (s.analysis.trimDb / 20) *
    (s.stereometer.geometry === "auto" ? autoGain : 1)
  );
}
export class PlotRenderer {
  private raster = document.createElement("canvas");
  private pixels: ImageData | null = null;
  private projected = new WeakMap<
    Uint16Array,
    { length: number; scale: string; maximum: number; values: Uint16Array }
  >();
  private frequencyPixels = 0;
  private spectrumPixels = 1;
  private plotHeight = 1;
  private intensityTable = new Float32Array(0);
  private intensityKey = "";
  private cells = new Float32Array(0);
  private stereoAlpha = new Float32Array(0);
  constructor(readonly id: ModuleId) {}
  render(
    canvas: HTMLCanvasElement,
    s: Settings,
    store: AnalysisStore,
    dpr: number,
  ) {
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width || !height) return;
    const pixelWidth = Math.round(width * dpr),
      pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const dark = s.appearance.theme === "dark";
    const rect = {
      x: 36,
      y: 10,
      w: Math.max(1, width - 48),
      h: Math.max(1, height - 38),
    };
    const c: RenderContext = {
      ctx,
      width,
      height,
      settings: s,
      store,
      dark,
      rect,
      ink: dark ? "#f1f1f1" : "#161616",
      muted: dark ? "#aaa" : "#606060",
      divider: dark ? "#383838" : "#d4d4d0",
    };
    this.plotHeight = rect.h;
    ctx.lineWidth = 1;
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.fillStyle = c.ink;
    ctx.strokeStyle = c.ink;
    if (this.id === "spectrogram") this.spectrogram(c);
    if (this.id === "waveform") this.waveform(c);
    if (this.id === "stereometer") this.stereometer(c);
    if (this.id === "oscilloscope") this.oscilloscope(c);
    if (this.id === "spectrum") this.spectrum(c);
  }
  private line(
    c: RenderContext,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = c.divider,
  ) {
    c.ctx.strokeStyle = color;
    c.ctx.beginPath();
    c.ctx.moveTo(x1, y1);
    c.ctx.lineTo(x2, y2);
    c.ctx.stroke();
  }
  private label(
    c: RenderContext,
    text: string,
    x: number,
    y: number,
    align: CanvasTextAlign = "left",
  ) {
    c.ctx.textAlign = align;
    c.ctx.fillStyle = c.muted;
    c.ctx.fillText(text, x, y);
    c.ctx.textAlign = "left";
  }
  private spectrogram(c: RenderContext) {
    const { store, settings: s, ctx, rect: r } = c;
    const config = s.spectrogram,
      vertical = config.orientation === "vertical",
      duration = effectiveDuration(s, "spectrogram");
    const maxHz = Math.min(20000, store.sampleRate / 2);
    const freqPixels = Math.max(
        1,
        Math.min(256, Math.round(vertical ? r.w : r.h)),
      ),
      timePixels = Math.max(1, Math.min(960, Math.round(vertical ? r.h : r.w)));
    const width = vertical ? freqPixels : timePixels,
      height = vertical ? timePixels : freqPixels;
    if (
      this.raster.width !== width ||
      this.raster.height !== height ||
      !this.pixels
    ) {
      this.raster.width = width;
      this.raster.height = height;
      this.pixels = this.raster
        .getContext("2d")!
        .createImageData(width, height);
    }
    const image = this.pixels;
    const background = c.dark ? 20 : 255;
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = background;
      image.data[i + 1] = background;
      image.data[i + 2] = background;
      image.data[i + 3] = 255;
    }
    const start = store.time - duration;
    this.frequencyPixels = freqPixels;
    const intensityKey = `${config.floor}/${config.ceiling}/${config.gamma}/${s.analysis.trimDb}`;
    if (!this.intensityTable.length)
      this.intensityTable = new Float32Array(65536);
    if (this.intensityKey !== intensityKey) {
      for (let code = 1; code < this.intensityTable.length; code++)
        this.intensityTable[code] =
          clamp(
            (spectralDb(code) + s.analysis.trimDb - config.floor) /
              (config.ceiling - config.floor),
          ) ** config.gamma;
      this.intensityKey = intensityKey;
    }
    if (this.cells.length !== timePixels * freqPixels)
      this.cells = new Float32Array(timePixels * freqPixels);
    const cellIntensity = this.cells;
    cellIntensity.fill(0);
    for (const slice of store.spectrogram) {
      if (slice.end < start || slice.start > store.time) continue;
      let projection = this.projected.get(slice.codes);
      if (
        !projection ||
        projection.length !== freqPixels ||
        projection.scale !== config.scale ||
        projection.maximum !== maxHz
      ) {
        const values = new Uint16Array(freqPixels);
        for (let f = 0; f < freqPixels; f++) {
          const low = positionFrequency(
              f / freqPixels,
              20,
              maxHz,
              config.scale,
            ),
            high = positionFrequency(
              (f + 1) / freqPixels,
              20,
              maxHz,
              config.scale,
            );
          let lo = 0,
            hi = slice.edges.length - 1;
          while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (slice.edges[mid + 1] <= low) lo = mid + 1;
            else hi = mid;
          }
          let value = 0;
          for (
            let k = lo;
            k < slice.codes.length && slice.edges[k] < high;
            k++
          ) {
            value = Math.max(value, slice.codes[k]);
          }
          values[f] = value;
        }
        projection = {
          length: freqPixels,
          scale: config.scale,
          maximum: maxHz,
          values,
        };
        this.projected.set(slice.codes, projection);
      }
      const fade =
          config.fade > 0
            ? Math.exp(-Math.max(0, store.time - slice.time) / config.fade)
            : 1,
        codes = projection.values;
      for (const [low, high] of historySpans(
        slice.start,
        slice.end,
        store.time,
        duration,
        config.timeMode,
      )) {
        const a = clamp(Math.floor(low * timePixels), 0, timePixels - 1),
          b = clamp(
            Math.max(a, Math.ceil(high * timePixels - 1e-9) - 1),
            0,
            timePixels - 1,
          );
        for (let t = a; t <= b; t++)
          for (let f = 0; f < freqPixels; f++)
            cellIntensity[t * freqPixels + f] = Math.max(
              cellIntensity[t * freqPixels + f],
              this.intensityTable[codes[f]] * fade,
            );
      }
    }
    for (let t = 0; t < timePixels; t++)
      for (let f = 0; f < freqPixels; f++) {
        const intensity = cellIntensity[t * freqPixels + f],
          value = Math.round(
            c.dark ? 20 + 221 * intensity : 255 - 233 * intensity,
          ),
          index = vertical
            ? (t * width + f) * 4
            : ((freqPixels - f - 1) * width + t) * 4;
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
      }
    this.raster.getContext("2d")!.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.raster, r.x, r.y, r.w, r.h);
    for (const slice of store.spectrogram) {
      if (!slice.gap || slice.time < start) continue;
      const u = historyPosition(
        slice.time,
        store.time,
        duration,
        config.timeMode,
      );
      if (vertical)
        this.line(c, r.x, r.y + r.h * u, r.x + r.w, r.y + r.h * u, c.muted);
      else this.line(c, r.x + r.w * u, r.y, r.x + r.w * u, r.y + r.h, c.muted);
    }
    if (config.timeMode === "sweep") {
      const u = historyPosition(
        store.time,
        store.time,
        duration,
        config.timeMode,
      );
      if (vertical)
        this.line(c, r.x, r.y + r.h * u, r.x + r.w, r.y + r.h * u, c.ink);
      else this.line(c, r.x + r.w * u, r.y, r.x + r.w * u, r.y + r.h, c.ink);
    }
    if (config.grid)
      for (const hz of [100, 1000, 10000]) {
        if (hz >= maxHz) continue;
        const u = frequencyPosition(hz, 20, maxHz, config.scale);
        if (vertical)
          this.line(c, r.x + r.w * u, r.y, r.x + r.w * u, r.y + r.h);
        else
          this.line(
            c,
            r.x,
            r.y + r.h * (1 - u),
            r.x + r.w,
            r.y + r.h * (1 - u),
          );
      }
    if (config.labels) {
      if (vertical) {
        this.label(c, "20 Hz", r.x, c.height - 10);
        this.label(c, frequencyLabel(maxHz), r.x + r.w, c.height - 10, "right");
        this.label(c, `−${duration.toFixed(1)}s`, 1, r.y + 11);
        this.label(c, "0", 20, r.y + r.h);
      } else {
        this.label(
          c,
          maxHz >= 1000
            ? `${+(maxHz / 1000).toFixed(1)}k`
            : String(Math.round(maxHz)),
          r.x - 5,
          r.y + 8,
          "right",
        );
        this.label(c, "20", r.x - 5, r.y + r.h, "right");
        this.label(c, `−${duration.toFixed(1)} s`, r.x, c.height - 10);
        this.label(c, "now", r.x + r.w, c.height - 10, "right");
      }
    }
  }
  private waveform(c: RenderContext) {
    const { rect: r, settings: s, ctx, store } = c,
      config = s.waveform;
    const duration = effectiveDuration(s, "waveform"),
      start = store.time - duration,
      gain = config.gain * 10 ** (s.analysis.trimDb / 20);
    const { lanes, laneHeight } = waveLanes(s, r.h);
    lanes.forEach((channel, lane) => {
      const center = r.y + laneHeight * (lane + 0.5),
        half = laneHeight * 0.4;
      this.line(c, r.x, center, r.x + r.w, center);
      this.label(c, store.fallback ? "Mono" : channel, 5, center + 4);
      const width = Math.max(1, Math.floor(r.w)),
        { mins, maxs, energy, counts, gaps, bands } = projectWaveform(
          store.waveform,
          start,
          store.time,
          width,
          channel,
        );
      ctx.strokeStyle = c.ink;
      ctx.fillStyle = c.ink;
      ctx.globalAlpha = config.style === "filled" ? 0.16 : 1;
      if (config.style === "filled") {
        for (let x = 0; x < width; x++)
          if (counts[x])
            ctx.fillRect(
              r.x + x,
              center - clamp(maxs[x] * gain, -1, 1) * half,
              1,
              Math.max(
                1,
                (clamp(maxs[x] * gain, -1, 1) - clamp(mins[x] * gain, -1, 1)) *
                  half,
              ),
            );
      }
      ctx.globalAlpha = 1;
      for (const values of [maxs, mins]) {
        ctx.beginPath();
        let started = false;
        for (let x = 0; x < width; x++) {
          if (!counts[x]) {
            started = false;
            continue;
          }
          if (gaps.has(x)) started = false;
          const y = center - clamp(values[x] * gain, -1, 1) * half;
          if (started) ctx.lineTo(r.x + x, y);
          else ctx.moveTo(r.x + x, y);
          started = true;
        }
        ctx.stroke();
      }
      for (let x = 0; x < width; x++)
        if (counts[x] && (maxs[x] * gain > 1 || mins[x] * gain < -1)) {
          ctx.fillRect(
            r.x + x,
            center + (maxs[x] * gain > 1 ? -half : half),
            1,
            3,
          );
        }
      if (config.rms) {
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        let started = false;
        for (let x = 0; x < width; x++) {
          if (!counts[x]) {
            started = false;
            continue;
          }
          if (gaps.has(x)) started = false;
          const rms = Math.sqrt(energy[x] / counts[x]);
          const y = center - clamp(rms * gain) * half;
          if (started) ctx.lineTo(r.x + x, y);
          else ctx.moveTo(r.x + x, y);
          started = true;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (config.style === "bands")
        for (let k = 0; k < 3; k++) {
          ctx.globalAlpha = [0.18, 0.55, 0.75][k];
          ctx.beginPath();
          let started = false;
          for (let x = 0; x < width; x++) {
            if (!counts[x]) {
              started = false;
              continue;
            }
            if (gaps.has(x)) started = false;
            const amplitude = clamp(bands[k][x] * gain) * half;
            if (k === 0)
              ctx.fillRect(r.x + x, center - amplitude, 1, amplitude * 2);
            else if (k === 1) {
              if (!started) ctx.moveTo(r.x + x, center - amplitude);
              else ctx.lineTo(r.x + x, center - amplitude);
              started = true;
            } else if (x % 3 === 0)
              ctx.fillRect(r.x + x, center - amplitude, 1, 1);
          }
          if (k === 1) ctx.stroke();
        }
      ctx.globalAlpha = 1;
    });
    if (config.bandHistory !== "off") {
      const horizon = config.bandHistory === "fast" ? 2 : 8;
      for (let k = 0; k < 3; k++) {
        const y = r.y + r.h - 22 + k * 7;
        ctx.globalAlpha = [0.8, 0.6, 0.5][k];
        ctx.beginPath();
        let started = false,
          lastEnd = -Infinity;
        for (const bucket of store.waveform) {
          if (!bucket.bands || bucket.end < store.time - horizon) continue;
          if (bucket.gap || bucket.start > lastEnd + 1 / store.sampleRate)
            started = false;
          const x = r.x + ((bucket.end - store.time + horizon) / horizon) * r.w,
            yy = y - clamp(bucket.bands[config.lane1][k] * gain) * 6;
          if (started) ctx.lineTo(x, yy);
          else ctx.moveTo(x, yy);
          started = true;
          lastEnd = bucket.end;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    this.label(c, `−${duration.toFixed(1)} s`, r.x, c.height - 10);
    this.label(c, "now", r.x + r.w, c.height - 10, "right");
  }
  private stereometer(c: RenderContext) {
    const { settings: s, store, rect: r, ctx } = c,
      config = s.stereometer;
    if (store.fallback) {
      this.label(
        c,
        "Synchronized L/R required",
        r.x + r.w / 2,
        r.y + r.h / 2,
        "center",
      );
      return;
    }
    const frame = store.stereometer;
    if (!frame) return;
    store.prunePersistence();
    const centerX = r.x + r.w / 2,
      centerY = r.y + r.h / 2,
      half = Math.min(r.w, r.h) * 0.43;
    const gain = stereoGain(s, frame.autoGain);
    if (config.grid) {
      this.line(c, centerX, r.y, centerX, r.y + r.h);
      this.line(c, r.x, centerY, r.x + r.w, centerY);
      ctx.strokeStyle = c.divider;
      ctx.beginPath();
      ctx.arc(centerX, centerY, half, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (config.labels) {
      const lr = config.geometry === "lr";
      this.label(c, lr ? "L" : "S", r.x + r.w, centerY - 5, "right");
      this.label(c, lr ? "R" : "Mono · M", centerX, r.y + 9, "center");
      if (!lr) {
        this.label(c, "R", centerX - half * 0.75, centerY - half * 0.75);
        this.label(
          c,
          "L",
          centerX + half * 0.75,
          centerY - half * 0.75,
          "right",
        );
      }
    }
    const window = config.windowMs / 1000,
      tau = config.persistenceMs / 1000,
      dpr = ctx.getTransform().a,
      point = store.stereoData,
      lr = config.geometry === "lr",
      lastBand = config.bands ? 2 : -1;
    // Tiles use physical pixels at the selected DPR. Their storage is bounded
    // independently of canvas size; every retained pair contributes unchanged.
    const tileSize = 512;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let row = 0; row < store.stereoCount; row++) {
      const offset =
        ((store.stereoWrite - store.stereoCount + row + 72000) % 72000) * 9;
      if (!pointOpacity(Math.max(0, store.time - point[offset]), window, tau))
        continue;
      for (let band = -1; band <= lastBand; band++) {
        const pair = offset + (band < 0 ? 1 : 3 + band * 2),
          left = point[pair],
          right = point[pair + 1],
          size = band === 2 ? 1 : config.pointSize,
          x =
            (centerX +
              clamp((lr ? left : (left - right) / 2) * gain, -1, 1) * half -
              size / 2) *
            dpr,
          y =
            (centerY -
              clamp((lr ? right : (left + right) / 2) * gain, -1, 1) * half -
              size / 2) *
            dpr;
        if (!Number.isFinite(x + y)) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + size * dpr);
        maxY = Math.max(maxY, y + size * dpr);
      }
    }
    minX = Math.max(0, Math.floor(minX));
    minY = Math.max(0, Math.floor(minY));
    maxX = Math.min(Math.round(c.width * dpr), Math.ceil(maxX));
    maxY = Math.min(Math.round(c.height * dpr), Math.ceil(maxY));
    if (maxX > minX && maxY > minY) {
      if (this.raster.width !== tileSize || this.raster.height !== tileSize) {
        this.raster.width = this.raster.height = tileSize;
        this.pixels = this.raster
          .getContext("2d")!
          .createImageData(tileSize, tileSize);
      }
      if (this.stereoAlpha.length !== tileSize * tileSize)
        this.stereoAlpha = new Float32Array(tileSize * tileSize);
      const alpha = this.stereoAlpha,
        pixels = this.pixels!.data,
        rasterContext = this.raster.getContext("2d")!,
        shade = c.dark ? 241 : 22;
      let tileX = 0,
        tileY = 0,
        tileWidth = 0,
        tileHeight = 0;
      const draw = (
        left: number,
        right: number,
        size: number,
        opacity: number,
      ) => {
        const x =
            (centerX +
              clamp((lr ? left : (left - right) / 2) * gain, -1, 1) * half -
              size / 2) *
            dpr,
          y =
            (centerY -
              clamp((lr ? right : (left + right) / 2) * gain, -1, 1) * half -
              size / 2) *
            dpr,
          edgeX = x + size * dpr,
          edgeY = y + size * dpr,
          startX = Math.max(tileX, Math.floor(x)),
          endX = Math.min(tileX + tileWidth, Math.ceil(edgeX)),
          startY = Math.max(tileY, Math.floor(y)),
          endY = Math.min(tileY + tileHeight, Math.ceil(edgeY));
        for (let py = startY; py < endY; py++) {
          const rowOpacity =
              opacity * (Math.min(py + 1, edgeY) - Math.max(py, y)),
            rowOffset = (py - tileY) * tileSize - tileX;
          for (let px = startX; px < endX; px++) {
            const coverage =
                rowOpacity * (Math.min(px + 1, edgeX) - Math.max(px, x)),
              index = rowOffset + px;
            // Accumulate before 8-bit rounding so faint overlapping trails
            // preserve source-over opacity and fractional rectangle coverage.
            alpha[index] += coverage * (1 - alpha[index]);
          }
        }
      };
      for (tileY = minY; tileY < maxY; tileY += tileSize)
        for (tileX = minX; tileX < maxX; tileX += tileSize) {
          tileWidth = Math.min(tileSize, maxX - tileX);
          tileHeight = Math.min(tileSize, maxY - tileY);
          alpha.fill(0, 0, tileHeight * tileSize);
          for (let row = 0; row < store.stereoCount; row++) {
            const offset =
                ((store.stereoWrite - store.stereoCount + row + 72000) %
                  72000) *
                9,
              opacity = pointOpacity(
                Math.max(0, store.time - point[offset]),
                window,
                tau,
              );
            if (!opacity) continue;
            draw(
              point[offset + 1],
              point[offset + 2],
              config.pointSize,
              opacity,
            );
            if (config.bands)
              for (let band = 0; band < 3; band++)
                draw(
                  point[offset + 3 + band * 2],
                  point[offset + 4 + band * 2],
                  band === 2 ? 1 : config.pointSize,
                  opacity * 0.5,
                );
          }
          for (let y = 0; y < tileHeight; y++)
            for (let x = 0; x < tileWidth; x++) {
              const index = y * tileSize + x,
                rgba = index * 4;
              pixels[rgba] = pixels[rgba + 1] = pixels[rgba + 2] = shade;
              pixels[rgba + 3] = Math.round(alpha[index] * 255);
            }
          rasterContext.putImageData(
            this.pixels!,
            0,
            0,
            0,
            0,
            tileWidth,
            tileHeight,
          );
          ctx.drawImage(
            this.raster,
            0,
            0,
            tileWidth,
            tileHeight,
            tileX / dpr,
            tileY / dpr,
            tileWidth / dpr,
            tileHeight / dpr,
          );
        }
    }
    if (config.correlation)
      this.label(
        c,
        `ρ ${frame.correlation === null ? "—" : frame.correlation.toFixed(2)}`,
        r.x,
        c.height - 10,
      );
    if (config.geometry === "auto")
      this.label(
        c,
        `${frame.autoGain.toFixed(2)}×`,
        r.x + r.w,
        c.height - 10,
        "right",
      );
  }
  private traceScope(c: RenderContext, values: Float32Array, alpha: number) {
    const { ctx, rect: r, settings: s } = c;
    const gain = s.oscilloscope.gain * 10 ** (s.analysis.trimDb / 20),
      center = r.y + r.h / 2,
      half = r.h * 0.43;
    const width = Math.floor(r.w);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = c.ink;
    ctx.beginPath();
    if (values.length > width * 2) {
      const { mins, maxs } = scopeExtrema(values, width);
      for (const edge of [maxs, mins]) {
        for (let x = 0; x < width; x++) {
          const y = center - clamp(edge[x] * gain, -1, 1) * half;
          if (x) ctx.lineTo(r.x + x, y);
          else ctx.moveTo(r.x + x, y);
        }
      }
      ctx.stroke();
      if (s.oscilloscope.fill) {
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const y = center - clamp(maxs[x] * gain, 0, 1) * half;
          if (x) ctx.lineTo(r.x + x, y);
          else ctx.moveTo(r.x + x, y);
        }
        for (let x = width - 1; x >= 0; x--)
          ctx.lineTo(r.x + x, center - clamp(mins[x] * gain, -1, 0) * half);
        ctx.closePath();
        ctx.globalAlpha = alpha * 0.06;
        ctx.fillStyle = c.ink;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    } else
      for (let i = 0; i < values.length; i++) {
        const x = r.x + (i / Math.max(1, values.length - 1)) * r.w,
          y = center - clamp(values[i] * gain, -1, 1) * half;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
    ctx.stroke();
    if (s.oscilloscope.fill && values.length <= width * 2) {
      ctx.lineTo(r.x + r.w, center);
      ctx.lineTo(r.x, center);
      ctx.closePath();
      ctx.globalAlpha = alpha * 0.06;
      ctx.fillStyle = c.ink;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  private oscilloscope(c: RenderContext) {
    const { rect: r, store, settings: s } = c;
    this.line(c, r.x, r.y + r.h / 2, r.x + r.w, r.y + r.h / 2);
    const frame = store.oscilloscope;
    if (!frame) return;
    if (frame.preparing) {
      this.label(
        c,
        "Preparing analysis",
        r.x + r.w / 2,
        r.y + r.h / 2 - 12,
        "center",
      );
      return;
    }
    store.prunePersistence();
    const tau = s.oscilloscope.persistenceMs / 1000;
    if (tau > 0)
      for (const trail of store.scopeFrames) {
        if (trail.latestFrame === frame.latestFrame) continue;
        this.traceScope(
          c,
          trail.values,
          pointOpacity(store.time - trail.time, 0, tau) * 0.4,
        );
      }
    this.traceScope(c, frame.values, 1);
    this.label(c, s.oscilloscope.channel, r.x - 9, r.y + r.h / 2 + 4, "right");
    this.label(
      c,
      frame.frequency
        ? `${s.oscilloscope.cycles} ${s.oscilloscope.cycles === 1 ? "cycle" : "cycles"} · ${frame.frequency.toFixed(1)} Hz`
        : `${(frame.duration * 1000).toFixed(1)} ms`,
      r.x,
      c.height - 10,
    );
    if (!frame.frequency && s.oscilloscope.mode === "pitch")
      this.label(c, "Pitch unavailable", r.x + r.w, c.height - 10, "right");
    else if (!frame.locked && s.oscilloscope.trigger !== "off")
      this.label(c, "Unsynchronized", r.x + r.w, c.height - 10, "right");
  }
  private spectrum(c: RenderContext) {
    const { rect: r, settings: s, store, ctx } = c,
      config = s.spectrum,
      maxHz = Math.min(20000, store.sampleRate / 2);
    for (const db of [0, -30, -60, -90]) {
      if (db < config.floor || db > config.ceiling) continue;
      const y =
        r.y + r.h * (1 - (db - config.floor) / (config.ceiling - config.floor));
      this.line(c, r.x, y, r.x + r.w, y);
      this.label(c, String(db), r.x - 5, y + 4, "right");
    }
    let lastLabel = -Infinity;
    for (const hz of [20, 100, 1000, 10000, maxHz]) {
      if (hz > maxHz) continue;
      const x = r.x + r.w * frequencyPosition(hz, 20, maxHz, config.scale);
      if (hz !== maxHz && (x - lastLabel < 48 || r.x + r.w - x < 48)) continue;
      this.label(
        c,
        hz >= 1000 ? `${+(hz / 1000).toFixed(1)}k` : String(hz),
        x,
        c.height - 10,
        hz === 20 ? "left" : hz === maxHz ? "right" : "center",
      );
      lastLabel = x;
    }
    const frame = store.spectrum;
    if (!frame) return;
    const width = Math.max(1, Math.floor(r.w));
    this.spectrumPixels = width;
    const values = new Float32Array(width),
      peaks = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      const bucket = spectralPixel(frame, config.scale, maxHz, x, width),
        adjustment =
          s.analysis.trimDb + config.tilt * Math.log2(bucket.frequency / 1000);
      values[x] = clamp(
        (levelDb(bucket.power) + adjustment - config.floor) /
          (config.ceiling - config.floor),
      );
      peaks[x] = clamp(
        (bucket.peak + adjustment - config.floor) /
          (config.ceiling - config.floor),
      );
    }
    if (config.style !== "line") {
      ctx.fillStyle = c.ink;
      for (let x = 0; x < width; x += 3) {
        ctx.globalAlpha = 0.12 + values[x] * 0.18;
        ctx.fillRect(r.x + x, r.y + r.h * (1 - values[x]), 2, r.h * values[x]);
      }
      ctx.globalAlpha = 1;
    }
    const trace = (data: Float32Array, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = c.ink;
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const y = r.y + r.h * (1 - data[x]);
        if (x) ctx.lineTo(r.x + x, y);
        else ctx.moveTo(r.x + x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    if (config.style !== "bars") trace(values, 1);
    if (config.peaks) {
      trace(peaks, 0.55);
      this.label(c, "Peaks", r.x + r.w - 4, r.y + 12, "right");
    }
  }
  measure(u: number, v: number, s: Settings, store: AnalysisStore): string {
    const maxHz = Math.min(20000, store.sampleRate / 2);
    if (this.id === "spectrum") {
      const frame = store.spectrum;
      if (!frame) return "No data";
      const pixel = Math.min(
          this.spectrumPixels - 1,
          Math.max(0, Math.floor(u * this.spectrumPixels)),
        ),
        bucket = spectralPixel(
          frame,
          s.spectrum.scale,
          maxHz,
          pixel,
          this.spectrumPixels,
        ),
        raw = levelDb(bucket.power);
      return `${frequencyLabel(bucket.low)}–${frequencyLabel(bucket.high)} · ${raw <= -160 ? "≤−160" : raw.toFixed(2)} dBFS${s.spectrum.tilt || s.analysis.trimDb ? ` · display ${(raw + s.analysis.trimDb + s.spectrum.tilt * Math.log2(bucket.frequency / 1000)).toFixed(2)} dB` : ""}${s.spectrum.note ? ` · ${noteLabel(bucket.frequency)}` : ""} · Δf ${(frame.sampleRate / frame.fftSize).toFixed(2)} Hz${bucket.interpolated ? " · interpolated; resolution is unchanged" : " · maximum across FFT bins"}`;
    }
    if (this.id === "spectrogram") {
      const vertical = s.spectrogram.orientation === "vertical",
        duration = effectiveDuration(s, "spectrogram"),
        time = historyTime(
          vertical ? v : u,
          store.time,
          duration,
          s.spectrogram.timeMode,
        ),
        frequency = positionFrequency(
          vertical ? u : 1 - v,
          20,
          maxHz,
          s.spectrogram.scale,
        ),
        slice = store.spectrogram.find(
          (frame) => time >= frame.start && time <= frame.end,
        );
      if (!slice) return "History unavailable";
      let bucket = 0;
      while (
        bucket < slice.codes.length - 1 &&
        slice.edges[bucket + 1] <= frequency
      )
        bucket++;
      if (this.frequencyPixels) {
        const f = Math.min(
            this.frequencyPixels - 1,
            Math.max(
              0,
              Math.floor((vertical ? u : 1 - v) * this.frequencyPixels),
            ),
          ),
          low = positionFrequency(
            f / this.frequencyPixels,
            20,
            maxHz,
            s.spectrogram.scale,
          ),
          high = positionFrequency(
            (f + 1) / this.frequencyPixels,
            20,
            maxHz,
            s.spectrogram.scale,
          );
        let first = 0;
        while (first < slice.codes.length - 1 && slice.edges[first + 1] <= low)
          first++;
        bucket = first;
        for (
          let k = first + 1;
          k < slice.codes.length && slice.edges[k] < high;
          k++
        )
          if (slice.codes[k] > slice.codes[bucket]) bucket = k;
      }
      const code = slice.codes[bucket],
        db =
          code === 0
            ? "≤−160"
            : code === 65535
              ? "≥+160"
              : spectralDb(code).toFixed(2);
      const media = store.mediaTime(slice.time);
      return `${frequencyLabel(slice.edges[bucket])}–${frequencyLabel(slice.edges[bucket + 1])} · ${db} dBFS · interval ${(1000 * (slice.end - slice.start)).toFixed(1)} ms · −${(store.time - slice.time).toFixed(2)} s${media !== null ? " · ≈" + timeLabel(media) : ""}${slice.interpolated[bucket] ? " · interpolated" : ""}`;
    }
    if (this.id === "waveform") {
      const { lanes, mainHeight, laneHeight } = waveLanes(s, this.plotHeight);
      const y = v * this.plotHeight;
      if (y >= mainHeight && s.waveform.bandHistory !== "off")
        return "Frequency history · point at the main lane to inspect";
      const duration = effectiveDuration(s, "waveform"),
        time = store.time - duration + u * duration,
        channel =
          lanes[
            Math.min(lanes.length - 1, Math.floor(y / Math.max(1, laneHeight)))
          ];
      let selected: WaveBucket | undefined;
      for (const bucket of store.waveform)
        if (time >= bucket.start && time <= bucket.end) {
          selected = bucket;
          break;
        }
      if (!selected) return "History unavailable";
      const stats = selected.channels[channel];
      return `${store.fallback ? "Mono" : channel} · min ${stats.min.toFixed(4)} / max ${stats.max.toFixed(4)} · RMS ${Math.sqrt(stats.sumSquares / stats.count).toFixed(4)} · interval ${(1000 * (selected.end - selected.start)).toFixed(1)} ms · −${(store.time - time).toFixed(2)} s`;
    }
    if (this.id === "stereometer")
      return `M=(L+R)/2 · S=(L−R)/2 · ρ=${store.stereometer?.correlation?.toFixed(3) ?? "—"} · gain ${stereoGain(s, store.stereometer?.autoGain).toFixed(2)}×`;
    const frame = store.oscilloscope;
    return frame
      ? `${(u * frame.duration * 1000).toFixed(2)} ms · ${frame.values[Math.min(frame.values.length - 1, Math.floor(u * frame.values.length))]?.toFixed(4) ?? "—"} · ${frame.frequency ? frame.frequency.toFixed(2) + " Hz · confidence " + frame.confidence.toFixed(2) : "Pitch unavailable"}`
      : "No data";
  }
  destroy() {
    this.projected = new WeakMap();
    this.intensityTable = new Float32Array(0);
    this.intensityKey = "";
    this.cells = new Float32Array(0);
    this.stereoAlpha = new Float32Array(0);
    this.raster.width = 0;
    this.raster.height = 0;
    this.pixels = null;
  }
}
