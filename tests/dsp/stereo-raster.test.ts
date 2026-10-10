import { describe, expect, it, vi } from "vitest";
import { PlotRenderer } from "../../src/visualizers/renderers";
import { AnalysisStore } from "../../src/visualizers/store";
import { defaults } from "../../src/settings/schema";

function canvas(width = 148, height = 138) {
  const surfaces: { width: number; height: number; image?: ImageData }[] = [],
    tiles: {
      x: number;
      y: number;
      width: number;
      height: number;
      data: Uint8ClampedArray;
      stride: number;
    }[] = [];
  let dpr = 1,
    fillCalls = 0;
  const factory = () => {
    const surface = {
      width: 0,
      height: 0,
      image: undefined as ImageData | undefined,
    };
    surfaces.push(surface);
    const context = new Proxy(
      {
        createImageData: (w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        }),
        putImageData: (image: ImageData) => {
          surface.image = image;
        },
        setTransform: (value: number) => {
          dpr = value;
        },
        getTransform: () => ({ a: dpr, d: dpr }),
        fillRect: () => {
          fillCalls++;
        },
        drawImage: (source: { image?: ImageData }, ...args: number[]) => {
          if (!source.image) return;
          const [sx, sy, w, h, x, y] = args;
          tiles.push({
            x: Math.round(x * dpr),
            y: Math.round(y * dpr),
            width: w,
            height: h,
            data: source.image.data.slice(),
            stride: source.image.width,
          });
        },
      } as Record<string, unknown>,
      {
        get: (target, key) =>
          key in target ? target[key as string] : () => {},
      },
    );
    return Object.assign(surface, { getContext: () => context });
  };
  vi.stubGlobal("document", { createElement: factory });
  const target = Object.assign(factory(), {
    clientWidth: width,
    clientHeight: height,
  }) as unknown as HTMLCanvasElement;
  return {
    target,
    tiles,
    fillCalls: () => fillCalls,
    pixel: (x: number, y: number) => {
      for (const tile of tiles) {
        if (
          x >= tile.x &&
          x < tile.x + tile.width &&
          y >= tile.y &&
          y < tile.y + tile.height
        ) {
          const i = ((y - tile.y) * tile.stride + x - tile.x) * 4;
          return Array.from(tile.data.slice(i, i + 4));
        }
      }
      return [0, 0, 0, 0];
    },
  };
}
function store(points: number[][]) {
  const settings = defaults();
  settings.stereometer.grid = false;
  settings.stereometer.labels = false;
  settings.stereometer.correlation = false;
  const store = new AnalysisStore(settings);
  store.time = 1;
  store.stereometer = {
    values: new Float32Array(),
    stride: 9,
    time: 1,
    latestFrame: 48000,
    startFrame: 0,
    revision: 1,
    correlation: 1,
    autoGain: 1,
  };
  store.stereoCount = points.length;
  store.stereoWrite = points.length;
  points.forEach((p, i) => store.stereoData.set(p, i * 9));
  return store;
}
describe("paired stereometer software compositing", () => {
  it("uses subpixel rectangle area and composites overlapping actual pairs", () => {
    const target = canvas(),
      data = store([
        [1, 0.25, 0.25, 0, 0, 0, 0, 0, 0],
        [1, 0.25, 0.25, 0, 0, 0, 0, 0, 0],
      ]);
    new PlotRenderer("stereometer").render(
      target.target,
      data.settings,
      data,
      1,
    );
    expect(target.pixel(85, 48)).toEqual([22, 22, 22, 60]);
    expect(target.pixel(85, 49)).toEqual([22, 22, 22, 155]);
    expect(target.fillCalls()).toBe(0);
  });
  it("evaluates every retained point opacity at exact visual age before compositing", () => {
    const target = canvas(),
      data = store([
        [0.73, 0.25, 0.25, 0, 0, 0, 0, 0, 0],
        [0.73, 0.25, 0.25, 0, 0, 0, 0, 0, 0],
      ]);
    data.settings.stereometer.windowMs = 20;
    data.settings.stereometer.persistenceMs = 250;
    new PlotRenderer("stereometer").render(
      target.target,
      data.settings,
      data,
      1,
    );
    const expected = Math.round(255 * (1 - (1 - 0.125 * Math.exp(-1)) ** 2));
    expect(target.pixel(85, 48)[3]).toBe(expected);
  });
  it("keeps physical DPR2 point size and dark monochrome ink", () => {
    const target = canvas(),
      data = store([[1, 0.25, 0.25, 0, 0, 0, 0, 0, 0]]);
    data.settings.appearance.theme = "dark";
    new PlotRenderer("stereometer").render(
      target.target,
      data.settings,
      data,
      2,
    );
    expect(target.pixel(171, 97)).toEqual([241, 241, 241, 128]);
    expect(target.pixel(172, 98)).toEqual([241, 241, 241, 255]);
  });
  it("preserves LR geometry and all three filtered-band positions", () => {
    const target = canvas(),
      data = store([[1, 0.25, 0.25, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]]);
    data.settings.stereometer.geometry = "lr";
    data.settings.stereometer.bands = true;
    new PlotRenderer("stereometer").render(
      target.target,
      data.settings,
      data,
      1,
    );
    // Filtered LR points occupy separate positions, each at half the point age opacity.
    expect(target.pixel(107, 81)[3]).toBeGreaterThan(0);
    expect(target.pixel(64, 38)[3]).toBeGreaterThan(0);
    expect(target.pixel(107, 38)[3]).toBeGreaterThan(0);
  });
  it("tiles large plots at full DPR without a larger scratch allocation", () => {
    const target = canvas(1300, 1300),
      data = store([
        [1, 1, 1, 0, 0, 0, 0, 0, 0],
        [1, -1, -1, 0, 0, 0, 0, 0, 0],
        [1, 1, -1, 0, 0, 0, 0, 0, 0],
        [1, -1, 1, 0, 0, 0, 0, 0, 0],
      ]);
    new PlotRenderer("stereometer").render(
      target.target,
      data.settings,
      data,
      2,
    );
    expect(target.tiles.length).toBeGreaterThan(1);
    expect(target.tiles.every((t) => t.width <= 512 && t.height <= 512)).toBe(
      true,
    );
    expect(target.tiles.some((t) => t.x > 512 || t.y > 512)).toBe(true);
  });
});
