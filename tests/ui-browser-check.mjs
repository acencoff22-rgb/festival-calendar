import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PLAYWRIGHT_MODULE;

if (!modulePath) {
  throw new Error("PLAYWRIGHT_MODULE must point to the installed Playwright module.");
}

const { chromium } = await import(
  pathToFileURL(modulePath).href
);

const baseUrl =
  process.env.UI_BASE_URL || "http://127.0.0.1:4173/";

const artifactDir =
  process.env.UI_ARTIFACT_DIR || "artifacts";

await mkdir(artifactDir, {
  recursive: true,
});

const browser = await chromium.launch({
  headless: true,
});

const pageErrors = [];

try {
  // Desktop layout and primary navigation.
  const desktop = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960,
    },
    deviceScaleFactor: 1,
  });

  desktop.on("pageerror", (error) => {
    pageErrors.push(`desktop: ${error.message}`);
  });

  const desktopResponse = await desktop.goto(baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });

  assert.equal(
    desktopResponse?.status(),
    200,
    "Desktop page must load successfully."
  );

  await desktop.waitForFunction(() => {
    const updatedAt =
      document.getElementById("updatedAt")?.textContent || "";

    const urgentView =
      document.getElementById("urgentView");

    return (
      Boolean(updatedAt.trim()) &&
      !updatedAt.includes("불러오는 중") &&
      Boolean(urgentView?.textContent.trim())
    );
  }, {
    timeout: 45_000,
  });

  assert.match(
    await desktop.locator("h1").innerText(),
    /전국 축제·공연 알리미/
  );

  await desktop.screenshot({
    path: `${artifactDir}/desktop-overview.png`,
    fullPage: true,
  });

  const drawer = desktop.locator("#filterDrawer");
  const handle = desktop.locator("#filterHandle");

  assert.equal(
    await drawer.getAttribute("aria-hidden"),
    "true",
    "Filter drawer must be hidden on initial load."
  );

  assert.notEqual(
    await drawer.getAttribute("inert"),
    null,
    "Closed filter drawer must be inert."
  );

  await handle.click();

  await desktop.waitForFunction(() => {
    const panel = document.getElementById("filterDrawer");
    return panel?.classList.contains("open");
  });

  assert.equal(await drawer.getAttribute("aria-hidden"), "false");
  assert.equal(await drawer.getAttribute("inert"), null);
  assert.equal(await handle.getAttribute("aria-expanded"), "true");

  // Search, event type and date conditions can be combined without closing the drawer.
  await desktop.locator("#search").fill("서울");
  await desktop.locator("#typeFilter").selectOption("performance");
  await desktop.locator('#dateQuickBar [data-mode="weekend"]').click();

  assert.equal(
    await drawer.evaluate((element) => element.classList.contains("open")),
    true,
    "Drawer must remain open while search/type/date filters are changed."
  );

  assert.equal(
    await desktop.locator("#filterSummaryText").evaluate((element) =>
      element.textContent.includes("서울")
    ),
    true,
    "Search condition must be reflected in the filter summary."
  );

  await desktop.screenshot({
    path: `${artifactDir}/desktop-filter-open.png`,
    fullPage: true,
  });

  // The region selector is a nested dialog. Escape should close only the topmost dialog.
  await desktop.locator("#areaFilterBtn").click();

  const areaModal = desktop.locator("#areaModal");

  await desktop.waitForFunction(() => {
    const modal = document.getElementById("areaModal");
    return modal && !modal.classList.contains("hidden");
  });

  assert.equal(await areaModal.getAttribute("aria-hidden"), "false");

  await desktop.keyboard.press("Escape");

  await desktop.waitForFunction(() => {
    const modal = document.getElementById("areaModal");
    return modal?.classList.contains("hidden");
  });

  assert.equal(
    await drawer.evaluate((element) => element.classList.contains("open")),
    true,
    "Closing the region dialog must leave the filter drawer open."
  );

  assert.equal(
    await desktop.evaluate(() => document.activeElement?.id),
    "areaFilterBtn",
    "Closing the region dialog must return focus to its opener."
  );

  // Closing the drawer should restore focus and remove it from keyboard navigation.
  await desktop.keyboard.press("Escape");

  await desktop.waitForFunction(() => {
    const panel = document.getElementById("filterDrawer");
    return !panel?.classList.contains("open");
  });

  assert.equal(await drawer.getAttribute("aria-hidden"), "true");
  assert.notEqual(await drawer.getAttribute("inert"), null);
  assert.equal(await handle.getAttribute("aria-expanded"), "false");
  assert.equal(
    await desktop.evaluate(() => document.activeElement?.id),
    "filterHandle"
  );

  // View toggle must keep its accessible pressed state in sync.
  await desktop.locator("#btnListView").click();

  assert.equal(await desktop.locator("#btnListView").getAttribute("aria-pressed"), "true");
  assert.equal(await desktop.locator("#btnUrgentView").getAttribute("aria-pressed"), "false");

  await desktop.screenshot({
    path: `${artifactDir}/desktop-monthly-list.png`,
    fullPage: true,
  });

  // Mobile bottom-sheet layout and touch-sized controls.
  const mobile = await browser.newPage({
    viewport: {
      width: 390,
      height: 844,
    },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  mobile.on("pageerror", (error) => {
    pageErrors.push(`mobile: ${error.message}`);
  });

  const mobileResponse = await mobile.goto(baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });

  assert.equal(
    mobileResponse?.status(),
    200,
    "Mobile page must load successfully."
  );

  await mobile.waitForFunction(() => {
    const updatedAt =
      document.getElementById("updatedAt")?.textContent || "";

    return (
      Boolean(updatedAt.trim()) &&
      !updatedAt.includes("불러오는 중")
    );
  }, {
    timeout: 45_000,
  });

  await mobile.screenshot({
    path: `${artifactDir}/mobile-overview.png`,
    fullPage: true,
  });

  const mobileHandle = mobile.locator("#filterHandle");
  const mobileDrawer = mobile.locator("#filterDrawer");

  await mobileHandle.click();

  await mobile.waitForFunction(() =>
    document.getElementById("filterDrawer")?.classList.contains("open")
  );

  const mobileGeometry = await mobileDrawer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      borderRadius: style.borderTopLeftRadius,
      position: style.position,
    };
  });

  assert.equal(mobileGeometry.position, "fixed");
  assert.ok(
    mobileGeometry.width >= mobileGeometry.viewportWidth - 2,
    `Mobile filter drawer should span the screen width: ${JSON.stringify(mobileGeometry)}`
  );
  assert.ok(
    mobileGeometry.height <= mobileGeometry.viewportHeight * 0.9,
    `Mobile filter drawer should stay within the viewport: ${JSON.stringify(mobileGeometry)}`
  );

  await mobile.screenshot({
    path: `${artifactDir}/mobile-filter-open.png`,
    fullPage: true,
  });

  await mobile.locator("#filterClose").click();

  await mobile.waitForFunction(() =>
    !document.getElementById("filterDrawer")?.classList.contains("open")
  );

  assert.equal(
    await mobile.locator("#filterDrawer").getAttribute("aria-hidden"),
    "true"
  );

  assert.deepEqual(
    pageErrors,
    [],
    `Unexpected uncaught browser errors: ${pageErrors.join("; ")}`
  );

  console.log("Browser UI checks passed.");
  console.log(`Desktop viewport: 1440x960`);
  console.log(`Mobile viewport: 390x844`);
  console.log(`Mobile filter geometry: ${JSON.stringify(mobileGeometry)}`);
  console.log(`Screenshots saved to: ${artifactDir}`);
} finally {
  await browser.close();
}
