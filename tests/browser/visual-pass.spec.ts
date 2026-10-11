import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("empty import leaves every plot action unobscured", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const blocked = await page
      .locator(".module-actions button")
      .evaluateAll((buttons) =>
        buttons
          .filter((button) => {
            const r = button.getBoundingClientRect();
            return !button.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            );
          })
          .filter((button) => button.getBoundingClientRect().top < innerHeight)
          .map((button) => button.getAttribute("aria-label")),
      );
    expect(blocked).toEqual([]);
  }
});

test("desktop seek offers a full touch target", async ({ page }) => {
  await page.goto("/");
  const rect = await page.locator(".seek input").boundingBox();
  expect(rect!.height).toBeGreaterThanOrEqual(44);
});

test("tablet final-row span counts plots independently of the import prompt", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  const workspace = (await page.locator(".workspace").boundingBox())!;
  expect((await page.locator(".module-slot").last().boundingBox())!.width).toBe(
    workspace.width,
  );
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    const s = structuredClone(c.settings);
    s.layout.enabled.spectrum = false;
    c.setSettings(s);
  });
  await expect(page.locator(".module-slot")).toHaveCount(4);
  expect(
    (await page.locator(".module-slot").last().boundingBox())!.width,
  ).toBeLessThan(workspace.width / 2);
});

test("phone track title retains usable reading space", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Довга назва — long track title that must remain available.wav",
      mimeType: "audio/wav",
      buffer: readFileSync("tests/fixtures/long.wav"),
    });
  const title = page.locator(".track-info strong");
  await expect(title).toContainText("Довга назва");
  expect((await title.boundingBox())!.width).toBeGreaterThanOrEqual(250);
});

test("Strip contains all plot headings and actions", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    const s = structuredClone(c.settings);
    s.layout.requested = "strip";
    c.setSettings(s);
  });
  await expect(page.locator(".workspace")).toHaveClass(/strip/);
  const overflow = await page.locator(".module-header").evaluateAll((headers) =>
    headers
      .filter((header) => {
        const r = header.getBoundingClientRect();
        return [...header.querySelectorAll("h2,button")].some((el) => {
          const box = el.getBoundingClientRect();
          return (
            box.left < r.left - 1 ||
            box.right > r.right + 1 ||
            box.bottom > r.bottom + 1
          );
        });
      })
      .map((header) => header.querySelector("h2")!.textContent),
  );
  expect(overflow).toEqual([]);
});

test("responsive playback keeps controls contained through breakpoint edges", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Довга назва — 音楽 — " + "long track name ".repeat(12) + ".wav",
      mimeType: "audio/wav",
      buffer: readFileSync("tests/fixtures/long.wav"),
    });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const viewports = [
    [320, 568],
    [375, 812],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [1920, 1080],
    [374, 700],
    [376, 700],
    [767, 700],
    [769, 700],
    [1199, 700],
    [1200, 700],
    [1439, 700],
    [1441, 700],
    [1919, 700],
    [1921, 700],
  ];
  // Sweep intermediate widths while the same track keeps playing.
  for (let width = 320; width <= 1920; width += 32)
    viewports.push([width, 700]);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      const c = (window as any).visualizer.controller;
      const s = structuredClone(c.settings);
      s.appearance.theme = theme;
      c.setSettings(s);
    }, theme);
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        )
        .toBe(0);
      const defects = await page
        .locator(
          ".player button,.player input,.player select,.top-actions button",
        )
        .evaluateAll((elements) =>
          elements
            .filter((el) => el.getClientRects().length)
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return (
                r.width < 43.9 ||
                r.height < 43.9 ||
                r.left < 0 ||
                r.right > innerWidth
              );
            })
            .map((el) => el.getAttribute("aria-label")),
        );
      expect(defects).toEqual([]);
      expect(
        await page.evaluate(
          () => (window as any).visualizer.controller.audio.state,
        ),
      ).toBe("playing");
    }
  }
});

test("font failure and delayed fonts keep controls readable and reachable", async ({
  page,
}) => {
  await page.route(/\.woff2(?:\?|$)/, (route) => route.abort());
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Appearance", exact: true }),
  ).toBeInViewport();
  await expect(page.getByLabel("Theme", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBe(0);
  await page.unrouteAll();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\.woff2(?:\?|$)/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Close panel" }).click();
  const before = await page.locator(".top-actions").boundingBox();
  release();
  await page.evaluate(() => document.fonts.ready);
  const after = await page.locator(".top-actions").boundingBox();
  expect(after).toEqual(before);
});

test("state-aware tooltips follow play, mute, repeat and theme actions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/long.wav");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toHaveAttribute("title", "Pause · Space");
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unmute", exact: true }),
  ).toHaveAttribute("title", "Unmute · M");
  await page.getByRole("button", { name: "Repeat: off", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Repeat: queue", exact: true }),
  ).toHaveAttribute("title", "Repeat: queue");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toHaveAttribute("title", "Switch to light theme");
});

test("short-screen settings preserve navigation, focus and all section actions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Appearance", exact: true }),
  ).toBeInViewport();
  for (const group of [
    "Appearance",
    "Composition",
    "Analysis",
    "Performance",
    "Presets",
    "Spectrogram",
    "Waveform",
    "Stereometer",
    "Oscilloscope",
    "Spectrum",
  ]) {
    const nav = page.getByRole("navigation", { name: "Settings groups" });
    await nav.getByRole("button", { name: group, exact: true }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("heading", { name: group, exact: true }),
    ).toBeInViewport();
  }
  await page
    .getByRole("button", { name: "Reset all settings" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Reset all settings" }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  const style = await settings.evaluate((el) => ({
    outline: getComputedStyle(el).outlineStyle,
    transition: getComputedStyle(el).transitionDuration,
  }));
  expect(style.outline).not.toBe("none");
  expect(style.transition).toBe("0s");
});
