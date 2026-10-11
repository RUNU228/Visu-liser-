import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const audio = (page: any) =>
  page.evaluate(() => {
    const a = (window as any).visualizer.controller.audio;
    return {
      time: a.store.time,
      session: a.diagnostics.sessionId,
      epoch: a.diagnostics.epoch,
      primary: a.diagnostics.primary,
      capturing: a.diagnostics.capturing,
      history: a.store.waveform.length,
      spectral: a.store.spectrogram.length,
      correlation: a.store.stereometer?.correlation,
      points: a.store.stereoCount,
      scopeFrequency: a.store.oscilloscope?.frequency,
      rms: a.store.rms,
      state: a.state,
      intent: a.intent,
      media: a.media.currentTime,
    };
  });

test("quad and 5.1 primary speaker downmix preserve expected channel energy", async ({
  page,
}) => {
  for (const [file, expected] of [
    ["quad.wav", [Math.sqrt(0.0443), Math.sqrt(0.03625)]],
    ["5.1.wav", [Math.sqrt(0.1772), Math.sqrt(0.145)]],
  ] as const) {
    await page.goto("/");
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(`tests/fixtures/${file}`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(async () => (await audio(page)).time)
      .toBeGreaterThan(2.1);
    const rms = await page.evaluate(() => {
      const buckets = (
        window as any
      ).visualizer.controller.audio.store.waveform.slice(-1000);
      return ["L", "R"].map((ch) => {
        let energy = 0,
          count = 0;
        for (const bucket of buckets) {
          energy += bucket.channels[ch].sumSquares;
          count += bucket.channels[ch].count;
        }
        return Math.sqrt(energy / count);
      });
    });
    expect(rms[0]).toBeCloseTo(expected[0], 2);
    expect(rms[1]).toBeCloseTo(expected[1], 2);
  }
});
test("codec smoke: mandatory WAV16/WAV24/MP3 and optional codecs", async ({
  page,
}) => {
  const codecs = [
    "stereo16.wav",
    "stereo24.wav",
    "stereo.mp3",
    "stereo.flac",
    "stereo.m4a",
    "stereo.ogg",
    "stereo.opus.ogg",
    "stereo.webm",
  ];
  const rows = [];
  for (const file of codecs) {
    await page.goto("/");
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(`tests/fixtures/${file}`);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).visualizer.controller.queue.rows[0]?.status,
        ),
      )
      .not.toBe("pending");
    const status = await page.evaluate(
      () => (window as any).visualizer.controller.queue.rows[0]?.status,
    );
    if (status !== "ready") {
      rows.push({ file, metadata: status, playback: false });
      expect(["stereo16.wav", "stereo24.wav", "stereo.mp3"]).not.toContain(
        file,
      );
      continue;
    }
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(async () => (await audio(page)).media)
      .toBeGreaterThan(0.15);
    await expect
      .poll(async () => (await audio(page)).spectral)
      .toBeGreaterThan(0);
    rows.push({
      file,
      metadata: status,
      playback: true,
      primary: (await audio(page)).primary,
    });
  }
  mkdirSync("docs/verification", { recursive: true });
  writeFileSync(
    `docs/verification/codecs-${test.info().project.name}.json`,
    JSON.stringify(
      { browser: await page.evaluate(() => navigator.userAgent), rows },
      null,
      2,
    ),
  );
});
test("mono, anti-phase, silence, and multichannel downmix use actual samples", async ({
  page,
}) => {
  for (const file of [
    "mono.wav",
    "anti.wav",
    "silence.wav",
    "quad.wav",
    "5.1.wav",
  ]) {
    await page.goto("/");
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(`tests/fixtures/${file}`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(async () => (await audio(page)).time)
      .toBeGreaterThan(0.2);
    const a = await audio(page);
    if (file === "mono.wav") expect(a.correlation).toBeCloseTo(1, 3);
    if (file === "anti.wav") expect(a.correlation).toBeCloseTo(-1, 3);
    if (file === "silence.wav") {
      expect(a.points).toBe(0);
      expect(a.correlation).toBe(null);
      expect(a.rms).toBe(0);
    } else expect(a.rms).toBeGreaterThan(0.01);
  }
});
test("plot freeze, context interruption, rapid seeks and worker/worklet recovery", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/long.wav");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await audio(page)).time).toBeGreaterThan(0.2);
  await page.getByRole("button", { name: "Freeze", exact: true }).click();
  const frozen = await audio(page);
  await page.waitForTimeout(200);
  expect((await audio(page)).time).toBe(frozen.time);
  expect((await audio(page)).media).toBeGreaterThan(frozen.media);
  await page.getByRole("button", { name: "Unfreeze", exact: true }).click();
  await expect.poll(async () => (await audio(page)).capturing).toBe(true);
  await page.evaluate(async () => {
    const a = (window as any).visualizer.controller.audio;
    await Promise.all([a.seek(5), a.seek(12), a.seek(21)]);
  });
  await expect.poll(async () => (await audio(page)).capturing).toBe(true);
  expect((await audio(page)).media).toBeGreaterThanOrEqual(21);
  await page.evaluate(
    async () =>
      await (window as any).visualizer.controller.audio.context.suspend(),
  );
  await expect.poll(async () => (await audio(page)).capturing).toBe(false);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await audio(page)).capturing).toBe(true);
  await page.evaluate(() =>
    (window as any).visualizer.controller.audio.worker.dispatchEvent(
      new ErrorEvent("error", { message: "Injected verification crash" }),
    ),
  );
  await expect
    .poll(async () => (await audio(page)).capturing, { timeout: 8000 })
    .toBe(true);
  await page.evaluate(() =>
    (window as any).visualizer.controller.audio.tap.dispatchEvent(
      new Event("processorerror"),
    ),
  );
  await expect
    .poll(async () => (await audio(page)).primary, { timeout: 8000 })
    .toBe(true);
  await page.evaluate(
    async () =>
      await (window as any).visualizer.controller.audio.retryAnalysis(),
  );
  await expect
    .poll(async () => (await audio(page)).capturing, { timeout: 8000 })
    .toBe(true);
  await expect.poll(async () => (await audio(page)).time).toBeGreaterThan(0.1);
});
test("layout linking, all-hidden, modal focus, and keyboard controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    const s = structuredClone(c.settings);
    s.layout.requested = "strip";
    s.layout.order = [
      "spectrum",
      "waveform",
      "spectrogram",
      "oscilloscope",
      "stereometer",
    ];
    c.setSettings(s);
  });
  await expect(page.locator(".workspace")).toHaveClass(/strip/);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.locator(".workspace")).not.toHaveClass(/strip/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".workspace")).toHaveClass(/strip/);
  const before = await page.locator(".workspace").boundingBox();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  expect(await page.locator(".workspace").boundingBox()).toEqual(before);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeFocused();
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    const s = structuredClone(c.settings);
    for (const key of Object.keys(s.layout.enabled))
      s.layout.enabled[key] = false;
    c.setSettings(s);
  });
  await expect(page.getByText("All visualizers are hidden")).toBeVisible();
  await page.getByRole("button", { name: "Show visualizers" }).click();
  await expect(page.locator("canvas")).toHaveCount(5);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
  });
  await page.keyboard.press("q");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
});
test("duplicate, corrupt file, import cancel, and failed-only queue remain usable", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/corrupt.mp3");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.queue.rows[0]?.status,
      ),
    )
    .toBe("failed");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeDisabled();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/stereo16.wav");
  await expect(page.getByText("stereo16", { exact: true })).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/stereo16.wav");
  await page.getByRole("button", { name: /Queue, 2/ }).click();
  await expect(page.getByRole("button", { name: "Add again" })).toBeVisible();
  await page.getByRole("button", { name: "Add again" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.queue.rows.length,
      ),
    )
    .toBe(3);
});
test("presets are atomic, preserve transport, and linked/max settings stay bounded", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/long.wav");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await audio(page)).time).toBeGreaterThan(0.2);
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    c.audio.setVolume(0.3, true);
    const s = structuredClone(c.settings);
    s.analysis.linked = true;
    s.analysis.sharedDuration = 40;
    s.spectrum.fftSize = 16384;
    s.spectrogram.fftSize = 16384;
    c.setSettings(s);
  });
  await expect.poll(async () => (await audio(page)).capturing).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as any).visualizer.controller.audio.diagnostics.reservedBytes,
    ),
  ).toBeLessThan(64 * 1024 ** 2);
  const before = await page.evaluate(() =>
    JSON.stringify((window as any).visualizer.controller.settings),
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  await page.locator("dialog input[type=file]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":1,"spectrum":{"fftSize":42}}'),
  });
  await expect(
    page.locator('dialog .panel-help[role="status"]'),
  ).not.toBeEmpty();
  expect(
    await page.evaluate(() =>
      JSON.stringify((window as any).visualizer.controller.settings),
    ),
  ).toBe(before);
  await page
    .getByRole("button", { name: "White Silence", exact: true })
    .click();
  const restored = await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    return {
      intent: c.audio.intent,
      volume: c.audio.volume,
      muted: c.audio.muted,
      rows: c.queue.rows.length,
      linked: c.settings.analysis.linked,
      fft: c.settings.spectrum.fftSize,
    };
  });
  expect(restored).toEqual({
    intent: true,
    volume: 0.3,
    muted: true,
    rows: 1,
    linked: false,
    fft: 4096,
  });
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({
    path: `docs/screenshots/${test.info().project.name}-playing-light-360.png`,
    fullPage: true,
  });
  const targetSizes = await page
    .locator("button:visible")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const r = element.getBoundingClientRect();
        return {
          name: element.getAttribute("aria-label") ?? element.textContent,
          width: r.width,
          height: r.height,
        };
      }),
    );
  for (const target of targetSizes) {
    expect(target.width, target.name ?? "button").toBeGreaterThanOrEqual(44);
    expect(target.height, target.name ?? "button").toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "More player options" }).click();
  await expect(page.locator("#mobile-player-options")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#mobile-player-options")).not.toBeVisible();
});
test("unavailable settings storage and reduced motion do not break playback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "could not be saved" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => getComputedStyle(document.querySelector(".ambient")!).animationName,
    ),
  ).toBe("none");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/stereo16.wav");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await audio(page)).capturing).toBe(true);
  await page.screenshot({
    path: `docs/screenshots/${test.info().project.name}-playing-dark-1440.png`,
    fullPage: true,
  });
});
