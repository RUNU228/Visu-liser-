import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const channel = process.env.TEST_BROWSER || "chrome";
const evidence = "docs/verification/visual-pass";
const shots = "docs/screenshots/visual-pass/after";
mkdirSync(evidence, { recursive: true });
mkdirSync(shots, { recursive: true });
const report = {
  channel,
  zoom: [],
  contrast: [],
  touch: {},
  states: [],
  fonts: [],
};
const errors = [];
const inspectLayout = async (page) =>
  page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    overflow: document.documentElement.scrollWidth - innerWidth,
    clipped: [...document.querySelectorAll("button,select,input[type=range]")]
      .filter(
        (el) =>
          el.getClientRects().length &&
          !el.closest("[popover]:not(:popover-open)"),
      )
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width < 43.9 ||
          r.height < 43.9 ||
          r.left < 0 ||
          r.right > innerWidth
        );
      })
      .map((el) => el.getAttribute("aria-label") || el.textContent.trim()),
  }));

// Chromium persists real page zoom by storage partition. "x" is the default
// partition key, not pinch scaling or CSS zoom. See Chromium's implementation:
// https://github.com/chromium/chromium/blob/main/chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc
const profile = mkdtempSync(join(tmpdir(), "visualizer-zoom-verification-"));
mkdirSync(join(profile, "Default"));
writeFileSync(
  join(profile, "Default", "Preferences"),
  JSON.stringify({
    partition: { default_zoom_level: { x: Math.log(2) / Math.log(1.2) } },
  }),
);
const zoomContext = await chromium.launchPersistentContext(profile, {
  channel,
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const zoomPage = await zoomContext.newPage();
await zoomPage.goto("http://127.0.0.1:5173");
await zoomPage.evaluate(() => document.fonts.ready);
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 640, height: 1136 },
]) {
  await zoomPage.setViewportSize(viewport);
  await zoomPage.waitForTimeout(200);
  const result = await inspectLayout(zoomPage);
  assert.equal(result.dpr, 2);
  assert.equal(result.width, viewport.width / 2);
  assert.equal(result.overflow, 0);
  assert.deepEqual(result.clipped, []);
  await zoomPage.getByRole("button", { name: "Settings", exact: true }).click();
  await zoomPage
    .getByRole("button", { name: "Reset all settings" })
    .scrollIntoViewIfNeeded();
  await zoomPage.getByRole("button", { name: "Close panel" }).click();
  report.zoom.push(result);
}
await zoomPage.screenshot({
  path: `${shots}/${channel}-zoom-200-320.png`,
  // A viewport capture preserves actual browser zoom. Chromium's full-page
  // screenshot clip uses layout CSS dimensions and crops this zoomed surface.
  fullPage: false,
});
await zoomContext.close();

const browser = await chromium.launch({
  channel,
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
report.browser = browser.version();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (response) => {
  if (/\.woff2(?:\?|$)/.test(response.url()))
    report.fonts.push({ url: response.url(), status: response.status() });
  if (response.status() >= 400)
    errors.push(`${response.status()} ${response.url()}`);
});
await page.goto("http://127.0.0.1:5173");
const luminance = (color) => {
  const values = color
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
};
const ratio = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
for (const theme of ["light", "dark"]) {
  await page.evaluate((theme) => {
    const c = window.visualizer.controller;
    const s = structuredClone(c.settings);
    s.appearance.theme = theme;
    c.setSettings(s);
  }, theme);
  await page.waitForTimeout(100);
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const keys = [
      "--bg",
      "--surface",
      "--ink",
      "--secondary",
      "--control-line",
      "--field",
    ];
    return Object.fromEntries(
      keys.map((key) => {
        const el = document.createElement("span");
        el.style.color = style.getPropertyValue(key);
        document.body.append(el);
        const value = getComputedStyle(el).color;
        el.remove();
        return [key, value];
      }),
    );
  });
  const result = { theme, text: [], boundaries: [] };
  for (const bg of ["--bg", "--surface", "--field"]) {
    for (const fg of ["--ink", "--secondary"]) {
      const value = ratio(colors[fg], colors[bg]);
      assert(value >= 4.5);
      result.text.push({ fg, bg, ratio: value });
    }
    const value = ratio(colors["--control-line"], colors[bg]);
    assert(value >= 3);
    result.boundaries.push({ bg, ratio: value });
  }
  report.contrast.push(result);
}
await page.evaluate(() => {
  const c = window.visualizer.controller;
  const s = structuredClone(c.settings);
  s.appearance.theme = "light";
  c.setSettings(s);
});
// Hold the existing metadata promise to inspect its real pending UI. Release it
// before playback; no production code or audio path is changed by this harness.
await page.evaluate(() => {
  const importer = window.visualizer.controller.importer;
  const prepare = importer.prepare.bind(importer);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  importer.prepare = async (...args) => {
    await gate;
    return prepare(...args);
  };
  window.releaseVisualImport = () => {
    importer.prepare = prepare;
    release();
  };
});
await page
  .locator("input[type=file]")
  .first()
  .setInputFiles(["tests/fixtures/long.wav", "tests/fixtures/corrupt.mp3"]);
await page.getByRole("button", { name: /^Queue,/ }).click();
assert(
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel import", exact: true })
    .isVisible(),
);
assert(await page.getByText("Preparing…", { exact: true }).first().isVisible());
await page.screenshot({
  path: `${shots}/${channel}-loading-1440.png`,
  fullPage: true,
});
report.states.push("metadata loading", "disabled pending selection");
await page.evaluate(() => window.releaseVisualImport());
await page.getByRole("button", { name: "Close panel" }).click();
await page.getByRole("button", { name: "Play", exact: true }).click();
await page.waitForFunction(
  () => window.visualizer.controller.audio.store.spectrum,
);
await page.getByRole("button", { name: "Pause", exact: true }).click();
await page.getByRole("button", { name: "Freeze", exact: true }).click();
report.states.push("playing", "paused", "frozen", "file error");
await page.getByRole("button", { name: /^Queue,/ }).click();
await page.screenshot({
  path: `${shots}/${channel}-queue-error-1440.png`,
  fullPage: true,
});
await page.getByRole("button", { name: "Close panel" }).click();
await page.evaluate(() => {
  const c = window.visualizer.controller;
  c.add([c.queue.active.file]);
});
await page.getByRole("button", { name: /^Queue,/ }).click();
await page.getByRole("button", { name: "Skip", exact: true }).click();
report.states.push("duplicate");
await page.getByRole("button", { name: "Clear queue", exact: true }).click();
await page
  .getByRole("button", { name: "Undo clear · 5 s", exact: true })
  .click();
report.states.push("undo");
await page.getByRole("button", { name: "Close panel" }).click();
await page.getByRole("button", { name: "Settings", exact: true }).click();
await page.getByRole("button", { name: "Presets", exact: true }).click();
await page.getByLabel("Preset name", { exact: true }).fill("Мій пресет — 音楽");
await page.getByRole("button", { name: "Save preset", exact: true }).click();
await page
  .getByRole("button", { name: "Rename Мій пресет — 音楽", exact: true })
  .click();
await page.screenshot({
  path: `${shots}/${channel}-preset-rename-1440.png`,
  fullPage: true,
});
report.states.push("saved preset", "preset rename");
await page.getByRole("button", { name: "Close panel" }).click();
await page.evaluate(() => {
  const c = window.visualizer.controller;
  const s = structuredClone(c.settings);
  for (const id of s.layout.order) s.layout.enabled[id] = false;
  c.setSettings(s);
});
await page.screenshot({
  path: `${shots}/${channel}-all-hidden-1440.png`,
  fullPage: true,
});
await page
  .getByRole("button", { name: "Show visualizers", exact: true })
  .click();
report.states.push("all hidden", "restored");
await page.evaluate(() =>
  window.visualizer.controller.audio.fallback("Analysis is unavailable."),
);
await page.screenshot({
  path: `${shots}/${channel}-analysis-notice-1440.png`,
  fullPage: true,
});
report.states.push("analysis fallback");
assert.deepEqual(errors, []);
report.errors = errors;

const touch = await browser.newContext({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
});
const phone = await touch.newPage();
await phone.goto("http://127.0.0.1:5173");
await phone
  .locator("input[type=file]")
  .first()
  .setInputFiles("tests/fixtures/long.wav");
await phone.getByRole("button", { name: "Play", exact: true }).tap();
await phone.waitForFunction(
  () => window.visualizer.controller.audio.store.spectrum,
);
await phone
  .getByRole("button", { name: "More player options", exact: true })
  .tap();
await phone.getByLabel("Mobile playback speed").selectOption("1.25");
await phone.getByRole("button", { name: "Repeat: off", exact: true }).tap();
await phone.getByRole("button", { name: "Shuffle", exact: true }).tap();
await phone.screenshot({
  path: `${shots}/${channel}-touch-options-375.png`,
  fullPage: true,
});
await phone.locator(".topbar").tap();
await phone.locator(".module-spectrogram canvas").tap();
assert(await phone.locator(".module-spectrogram .plot-tooltip").isVisible());
report.touch = await phone.evaluate(() => ({
  state: window.visualizer.controller.audio.state,
  rate: window.visualizer.controller.audio.rate,
  repeat: window.visualizer.controller.queue.repeat,
  shuffle: window.visualizer.controller.queue.shuffle,
  coarse: matchMedia("(pointer:coarse)").matches,
  maxTouchPoints: navigator.maxTouchPoints,
}));
assert.equal(report.touch.state, "playing");
assert.equal(report.touch.rate, 1.25);
assert.equal(report.touch.repeat, "queue");
assert.equal(report.touch.shuffle, true);
await browser.close();
writeFileSync(
  `${evidence}/accessibility-${channel}.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
