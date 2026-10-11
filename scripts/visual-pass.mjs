import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const phase = process.argv[2] || "after";
const channel = process.env.TEST_BROWSER || "chrome";
const dir = `docs/screenshots/visual-pass/${phase}`;
mkdirSync(dir, { recursive: true });
mkdirSync("docs/verification/visual-pass", { recursive: true });
const browser = await chromium.launch({
  channel,
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = {
  phase,
  browser: browser.version(),
  channel,
  errors,
  layouts: [],
};
await page.goto("http://127.0.0.1:5173");
await page.evaluate(() => document.fonts.ready);
const english = (await page.locator("html").getAttribute("lang")) === "en";
const settings = () =>
  page.getByRole("button", {
    name: english ? "Settings" : "Настройки",
    exact: true,
  });
const close = () =>
  page.getByRole("button", {
    name: english ? "Close panel" : "Закрыть панель",
    exact: true,
  });
const capture = async (state, width, height) => {
  await page.setViewportSize({ width, height });
  // Offscreen plots intentionally stop rendering. Visit them before a full-page
  // capture so their backing stores reflect this viewport rather than the last one.
  for (const canvas of await page.locator("canvas").all()) {
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(180);
  report.layouts.push(
    await page.evaluate(
      ({ state }) => {
        const controls = [
          ...document.querySelectorAll("button,select,input:not([hidden])"),
        ].filter(
          (e) =>
            e.getClientRects().length &&
            !e.closest("[popover]:not(:popover-open)"),
        );
        const small = controls
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return (r.width < 43.9 || r.height < 43.9) && e.type !== "checkbox";
          })
          .map((e) => ({
            label: e.getAttribute("aria-label") || e.textContent.trim(),
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
          }));
        return {
          state,
          width: innerWidth,
          height: innerHeight,
          overflow: document.documentElement.scrollWidth - innerWidth,
          small,
          canvases: [...document.querySelectorAll("canvas")].map((e) => ({
            width: e.width,
            height: e.height,
            cssWidth: e.clientWidth,
            cssHeight: e.clientHeight,
          })),
        };
      },
      { state },
    ),
  );
  if ([320, 390, 1440].includes(width))
    await page.screenshot({
      path: `${dir}/${channel}-${state}-${width}.png`,
      fullPage: true,
    });
};
for (const [w, h] of [
  [320, 568],
  [375, 812],
  [390, 844],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
])
  await capture("empty", w, h);
await page.setViewportSize({ width: 1440, height: 900 });
await settings().click();
await page.screenshot({
  path: `${dir}/${channel}-settings-1440.png`,
  fullPage: true,
});
await close().click();
await page
  .locator("input[type=file]")
  .first()
  .setInputFiles(["tests/fixtures/long.wav", "tests/fixtures/silence.wav"]);
await page
  .getByRole("button", {
    name: english ? "Play" : "Воспроизвести",
    exact: true,
  })
  .click();
await page.waitForFunction(
  () => window.visualizer.controller.audio.store.spectrum,
);
await page.waitForTimeout(1000);
for (const [w, h] of [
  [320, 568],
  [375, 812],
  [390, 844],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
])
  await capture("playing", w, h);
await page.setViewportSize({ width: 390, height: 844 });
await page
  .getByRole("button", { name: english ? /^Queue,/ : /^Очередь,/ })
  .click();
await page.screenshot({
  path: `${dir}/${channel}-queue-390.png`,
  fullPage: true,
});
await close().click();
await page
  .getByRole("button", {
    name: english ? "More player options" : "Дополнительные параметры плеера",
    exact: true,
  })
  .click();
await page.screenshot({
  path: `${dir}/${channel}-options-390.png`,
  fullPage: true,
});
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => {
  const c = window.visualizer.controller;
  c.audio.seek(0);
  c.audio.store.latency = [];
  c.audio.store.centerAge = [];
  c.audio.store.frameTimes = [];
  c.audio.store.renderTimes = [];
  c.audio.store.lastRender = 0;
});
console.log(`${phase}: 60-second matched playback run started`);
for (let i = 0; i < 6; i++) await page.waitForTimeout(10000);
report.performance = await page.evaluate(() => ({
  ...window.visualizer.controller.audio.diagnostics,
  effective: window.visualizer.scheduler.effective,
  time: window.visualizer.controller.audio.media.currentTime,
  state: window.visualizer.controller.audio.state,
}));
await page
  .getByRole("button", { name: english ? "Pause" : "Пауза", exact: true })
  .click();
await capture("paused", 1440, 900);
await page.evaluate(() => {
  const c = window.visualizer.controller;
  const s = structuredClone(c.settings);
  s.appearance.theme = "dark";
  c.setSettings(s);
});
await capture("dark-paused", 1440, 900);
await capture("dark-paused", 320, 568);
writeFileSync(
  `docs/verification/visual-pass/${phase}-${channel}.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
