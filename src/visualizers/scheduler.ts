import { PlotRenderer } from "./renderers";
import type { ModuleId } from "../shared/types";
import type { AudioEngine } from "../audio/engine";
export class RenderScheduler {
  private plots = new Map<
    ModuleId,
    { canvas: HTMLCanvasElement; renderer: PlotRenderer; visible: boolean }
  >();
  private raf = 0;
  private last = 0;
  private dirty = true;
  private storeVersion = -1;
  focus: ModuleId | null = null;
  constructor(private audio: AudioEngine) {
    document.addEventListener("visibilitychange", this.visibility);
    window.addEventListener("resize", this.resize);
    this.start();
  }
  private visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.audio.store.lastRender = 0;
    } else this.start();
  };
  private resize = () => {
    this.dirty = true;
    this.audio.configure(this.audio.store.settings);
  };
  register(id: ModuleId, canvas: HTMLCanvasElement) {
    const renderer = new PlotRenderer(id),
      entry = { canvas, renderer, visible: true };
    this.plots.set(id, entry);
    const observer = new IntersectionObserver((entries) => {
      entry.visible = entries[0].isIntersecting;
      this.dirty = true;
    });
    observer.observe(canvas);
    const resize = new ResizeObserver(() => {
      this.dirty = true;
    });
    resize.observe(canvas);
    this.dirty = true;
    return () => {
      observer.disconnect();
      resize.disconnect();
      renderer.destroy();
      this.plots.delete(id);
    };
  }
  invalidate() {
    this.dirty = true;
  }
  get effective() {
    const s = this.audio.store.settings,
      mobile = innerWidth < 768 || matchMedia("(pointer: coarse)").matches;
    return {
      fps: s.performance.economy
        ? 30
        : s.performance.fps === "auto"
          ? mobile
            ? 30
            : 60
          : Number(s.performance.fps),
      dpr: Math.min(
        devicePixelRatio || 1,
        s.performance.dpr,
        mobile || s.performance.economy ? 1.5 : 2,
      ),
    };
  }
  private start() {
    if (!this.raf && !document.hidden)
      this.raf = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.raf = 0;
    if (document.hidden) return;
    const { fps, dpr } = this.effective;
    const interval = 1000 / fps;
    if (now - this.last >= interval - 0.5) {
      this.last = now - ((now - this.last) % interval);
      const store = this.audio.store;
      if (this.dirty || store.version !== this.storeVersion) {
        const started = performance.now();
        for (const [id, entry] of this.plots) {
          if (!entry.visible || (this.focus && id !== this.focus)) continue;
          entry.renderer.render(entry.canvas, store.settings, store, dpr);
        }
        this.audio.store.recordRender(
          this.audio.context,
          now,
          performance.now() - started,
        );
        this.storeVersion = store.version;
        this.dirty = false;
      }
    }
    this.start();
  };
  destroy() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.visibility);
    window.removeEventListener("resize", this.resize);
    for (const plot of this.plots.values()) plot.renderer.destroy();
    this.plots.clear();
  }
}
