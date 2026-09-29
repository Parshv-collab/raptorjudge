import { expect, test, type Locator, type Page } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

/**
 * The focus ring, measured in a real browser against real painted pixels.
 *
 * WCAG 2.2 puts the number on a focus indicator twice: SC 1.4.11 (Non-text
 * Contrast) and SC 2.4.13 (Focus Appearance) both want **3:1 against the
 * colours adjacent to it**, and 2.4.13 also wants an area equivalent to a 2px
 * perimeter. This ring used to be the accent at 40% alpha, which measured
 * **1.70:1** on the canvas — and the same 1.70:1 on surface-1 and surface-2,
 * because a translucent colour composites toward whatever it is painted on. It
 * was failing on every surface in the system, and because the alpha was written
 * inline in `src/index.css` (`outline: 2px solid rgba(255, 45, 85, 0.4)`)
 * nothing in the source said so.
 *
 * `tests/focusRing.test.ts` locks the token. This spec is the other half: it
 * proves the token reaches the screen, by screenshotting a focused element and
 * reading the pixels the compositor actually produced. Four things are checked
 * per element, in increasing order of how hard they are to fake:
 *
 *   1. **computed style** — `:focus-visible` matched, the outline is solid,
 *      ≥ 2px wide, offset by ≥ 1px, and its colour is fully opaque. A
 *      translucent ring cannot pass this.
 *   2. **painted geometry** — ≥ 1.5px of the outline's band is actually on
 *      screen, i.e. the 2px perimeter 2.4.13 asks for is really there.
 *   3. **painted contrast, inside** — the ring against the surface showing
 *      through the `outline-offset` gap between it and the component.
 *   4. **painted contrast, outside** — the ring against the surface on its far
 *      side. SC 1.4.11 says "adjacent colours", plural, so the smaller of the
 *      two is the number that has to clear 3:1.
 *
 * The two references are read from the pixels immediately around the band
 * rather than assumed, which is what makes this a measurement: it would have
 * reported 1.70:1 for the old token without anybody arguing with the maths.
 *
 * The ring colour is read the same way — the band row furthest from the surface
 * *is* the ring as painted, not the colour the token asked for. That is not
 * pedantry: it is how this spec found that `.auth-grid`'s backdrop `mask` was
 * compositing the entire sign-in card, ring included, at 77–93% alpha, costing
 * 0.8 of a point of contrast on a button that was otherwise fine.
 *
 * Sampling notes, all of which cost a wrong answer before they cost a fix:
 *
 *   · The capture is the **whole viewport**, not a `clip` rectangle. A clip is
 *     resolved in document space while `getBoundingClientRect()` is viewport
 *     space, so on a scrolled page the two disagree by exactly the scroll
 *     offset — which reads as "no ring painted" for an element whose ring is
 *     plainly on screen.
 *   · `html { scroll-behavior: smooth }` makes both the scroll into view and
 *     `focus()`'s own scroll *animated*, so the spec waits for the box to stop
 *     moving before measuring. Mid-flight it read the rect at one position and
 *     the screenshot at another, a few pixels apart.
 *   · The element is scrolled to the middle of the viewport first, so the ring
 *     is never clipped by an edge, and the rect is re-read *after* the scroll.
 *   · The band is scored by **colour coverage**, not by run-length matching the
 *     computed geometry. The browser snaps an outline to device pixels, so on a
 *     fractional layout a 2px ring lands as 1 + 0.5 + 0.5 across three rows and
 *     never lines up with `offset`/`width` arithmetic. Each row scores how far
 *     it sits along the line from the adjacent surface to the ring's own
 *     colour, so a 91%-covered row counts as 0.9 rather than being discarded
 *     as "not exactly the ring colour" — which is what a strict equality match
 *     did, and it reported a perfectly visible ring as missing.
 *   · Several columns across the element are sampled and the best-supported one
 *     reported, because a gradient or a rounded corner can make any single
 *     column unrepresentative.
 */

/** WCAG 2.x relative luminance + contrast, evaluated in the page. */
const CONTRAST = `
  function lin(c){ c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
  function lum(rgb){ return 0.2126*lin(rgb[0]) + 0.7152*lin(rgb[1]) + 0.0722*lin(rgb[2]); }
  function ratio(a,b){ const x=lum(a), y=lum(b); const hi=Math.max(x,y), lo=Math.min(x,y); return (hi+0.05)/(lo+0.05); }
`;

/** Where a focused element's ring was found, and what it measured against. */
interface RingReading {
  /** `:focus-visible` matched and the element is the one holding focus. */
  focusVisible: boolean;
  outlineStyle: string;
  outlineWidth: number;
  outlineOffset: number;
  /** The authored outline colour, e.g. `rgb(255, 45, 85)`. */
  outlineColor: string;
  /** Alpha from the authored colour; 1 means opaque. */
  outlineAlpha: number;
  /** The surface showing through the offset gap, from the screenshot. */
  inside: number[];
  /** The surface on the far side of the ring, from the screenshot. */
  outside: number[];
  /** The band's rows with how much of each is painted ring. */
  band: { y: number; rgb: number[]; cover: number }[];
  /** Coverage of the band in px (SC 2.4.13 wants ≥ 2). */
  paintedPx: number;
  /** ring vs the gap, ring vs the far side. */
  contrast: { inside: number; outside: number };
  /** The colour the solidest painted row actually has, from the pixels. */
  ringColor: number[];
  /** The colour the token asked for, for comparing against `ringColor`. */
  authored: number[];
  /** Just inside the element's border box (its own fill, for filled buttons). */
  fill: number[] | null;
  /** Where the screenshot was taken, for diagnosing a failure. */
  capture: { rect: string; column: number; scrollY: number };
}

const MIN_CONTRAST = 3;

/**
 * Focus `locator` the way a keyboard user would and wait until the browser is
 * actually painting an outline on it.
 *
 * The real `Tab` matters: `:focus-visible` is a keyboard signal, and Chrome
 * keeps that modality for a programmatic focus that follows keyboard input,
 * whereas `.focus()` on its own can leave `:focus-visible` unmatched — which
 * would have made this spec measure nothing and pass.
 */
async function focusWithRing(page: Page, locator: Locator) {
  const el = locator.first();
  await el.waitFor({ state: "visible" });
  await el.evaluate((node) => node.scrollIntoView({ block: "center" }));
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press("Tab");
    await el.focus();
    const painted = await el.evaluate(async (node) => {
      // `html { scroll-behavior: smooth }` (src/index.css) makes both the
      // `scrollIntoView` above and `focus()`'s own scroll *animated*. Measuring
      // mid-flight reads the rect at one position and the screenshot at
      // another, a few pixels apart, and reports "no ring painted" for a ring
      // that is plainly there. React can also remount the node between focus and
      // paint, so re-assert across frames — and only accept a box that has
      // stopped moving.
      let lastTop = Number.NaN;
      let stable = 0;
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const held =
          document.activeElement === node && getComputedStyle(node).outlineStyle !== "none";
        const top = node.getBoundingClientRect().top;
        stable = held && top === lastTop ? stable + 1 : 0;
        lastTop = top;
        if (stable >= 2) return true;
      }
      return false;
    });
    if (painted) return el;
  }
  throw new Error("element would not hold a visible focus ring");
}

/**
 * Screenshot the element's neighbourhood and read the ring off the pixels.
 *
 * The outline's band is bounded by geometry — it runs from
 * `top - offset - width` to `top - offset` — but *within* that window the rows
 * are scored by how much of each is ring. A row of pure surface scores 0, a row
 * that is 91% covered scores 0.91, and a solid row scores 1, so the sum is the
 * perimeter actually on screen regardless of how the compositor split it.
 *
 * Both reference colours come from the rows hugging the band: the gap row
 * immediately inside it (the surface between ring and component, which is what
 * the `outline-offset` exists to reveal) and the rows immediately outside it.
 * Neither is assumed — both are read, so a ring drawn onto the wrong surface
 * would be caught rather than scored against whatever the test hoped for.
 */
async function readRing(page: Page, el: Locator): Promise<RingReading> {
  const style = await el.evaluate((node) => {
    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    const alpha = cs.outlineColor.match(/[\d.]+/g);
    return {
      focusVisible: node.matches(":focus-visible"),
      outlineStyle: cs.outlineStyle,
      outlineWidth: parseFloat(cs.outlineWidth) || 0,
      outlineOffset: parseFloat(cs.outlineOffset) || 0,
      outlineColor: cs.outlineColor,
      outlineAlpha: alpha && alpha.length > 3 ? Number(alpha[3]) : 1,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollY: window.scrollY,
    };
  });

  const top = style.rect.y;
  const outer = top - style.outlineOffset - style.outlineWidth;
  const inner = top - style.outlineOffset;
  // A 1.5px margin each side absorbs the compositor's device-pixel snapping.
  const scanTop = Math.max(0, Math.floor(outer - 1.5));
  const scanBottom = Math.min(
    style.viewport.height,
    Math.ceil(inner + 1.5) + 1,
  );

  // Five columns across the element: the centre, then pairs either side, so a
  // gradient, a rounded corner or an overlapping sibling cannot make the whole
  // ring look absent because one column was unrepresentative.
  const columns = [0.5, 0.2, 0.8, 0.35, 0.65]
    .map((f) => Math.round(style.rect.x + style.rect.w * f))
    .map((x) => Math.min(style.viewport.width - 1, Math.max(0, x)));

  expect(
    scanBottom - scanTop,
    `${style.outlineColor}: the element must be far enough into the viewport to capture its ring`,
  ).toBeGreaterThanOrEqual(6);

  const shot = await page.screenshot({ scale: "css" });
  const ringRgb = (style.outlineColor.match(/[\d.]+/g) ?? ["255", "45", "85"])
    .slice(0, 3)
    .map(Number);

  const measured = await page.evaluate(
    async ({ png, columns, scanTop, scanBottom, outer, inner, elementTop, offset, ring, contrastSrc }) => {
      const ratio = new Function("a", "b", contrastSrc + "; return ratio(a,b);");
      const dist = (a: number[], b: number[]) =>
        Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
      const mode = (list: number[][]) => {
        const counts = new Map<string, number>();
        for (const c of list) {
          const key = c.join(",");
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const top = [...counts].sort((a, b) => b[1] - a[1])[0];
        return top ? top[0].split(",").map(Number) : null;
      };

      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(image, 0, 0);
      const at = (x: number, y: number) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]];
      };

      const readings = [];
      for (const column of columns) {
        // Every row of the capture window at this column.
        const rows: { y: number; rgb: number[] }[] = [];
        for (let y = scanTop; y < scanBottom; y++) {
          if (y >= image.height) break;
          rows.push({ y, rgb: at(column, y) });
        }

        // The gap: the surface between the ring and the component's own border
        // box, which is what `outline-offset` reserves. Only rows that sit
        // *entirely* inside it count — on a fractional layout the last row
        // before the element's top edge straddles the boundary and carries part
        // of the component's own border, which for an accent-bordered input is
        // the accent, and that would invert the whole measurement.
        const gapRows = rows.filter(
          (r) => r.y >= elementTop - offset && r.y + 1 <= elementTop,
        );
        const inside =
          mode(gapRows.map((r) => r.rgb)) ??
          rows[Math.min(rows.length - 1, Math.max(0, Math.floor(elementTop) - 1 - scanTop))].rgb;

        // Rows the outline may have painted, with a pixel of slack either side
        // for the compositor's device-pixel snapping.
        const band = rows.filter(
          (r) => r.y + 0.5 > outer - 1.5 && r.y + 0.5 < inner + 1.5,
        );

        // Calibrate against what actually reached the screen, not against the
        // authored colour: the row in the band furthest from the surface *is*
        // the ring as painted. Anything that composites over the page (a mask,
        // an opacity, a filter) dims the ring and everything else together, and
        // this measures the dimmed value rather than the one in the token — which
        // is how `.auth-grid`'s `mask-image` was caught eating the ring's
        // contrast. `tests/focusRing.test.ts` guards the mask itself.
        const solid = band.reduce(
          (best, r) => (dist(r.rgb, inside) > dist(best.rgb, inside) ? r : best),
          band[0] ?? { y: 0, rgb: inside },
        );
        const span = band.length ? dist(solid.rgb, inside) : 0;
        if (span < 12) {
          // Nothing in the window is distinguishable from the surface.
          readings.push({
            column,
            paintedPx: 0,
            band: band.map((r) => ({ y: r.y + 0.5, rgb: r.rgb, cover: 0 })),
            inside,
            outside: inside,
            ringColor: inside,
            fill: null,
            contrast: { inside: 1, outside: 1 },
          });
          continue;
        }
        const scored = band.map((r) => ({
          ...r,
          cover: Math.max(0, Math.min(1, 1 - dist(r.rgb, solid.rgb) / span)),
        }));
        const paintedPx = +scored.reduce((sum, r) => sum + r.cover, 0).toFixed(2);

        // The far side: the first genuinely solid ring row, then the four rows
        // above it. A patch rather than a single pixel, because one row of a
        // gradient is one point on it, not the surface the ring is drawn on.
        const solidTop = scored.find((r) => r.cover > 0.985)?.y ?? solid.y;
        const above = rows.filter((r) => r.y < solidTop && r.y >= solidTop - 4);
        const outside = mode(above.map((r) => r.rgb)) ?? inside;

        readings.push({
          column,
          paintedPx,
          band: scored.map((r) => ({ y: r.y + 0.5, rgb: r.rgb, cover: +r.cover.toFixed(2) })),
          inside,
          outside,
          ringColor: solid.rgb,
          fill: at(column, Math.min(image.height - 1, Math.round(elementTop + 1))),
          contrast: {
            inside: +ratio(solid.rgb, inside).toFixed(2),
            outside: +ratio(solid.rgb, outside).toFixed(2),
          },
        });
      }

      // The most completely painted column is the one that best represents the
      // ring; the others are kept for the failure message.
      const best = readings.reduce((a, b) =>
        b.paintedPx > a.paintedPx || (b.paintedPx === a.paintedPx && b.contrast.inside > a.contrast.inside)
          ? b
          : a,
      );
      return {
        ...best,
        authored: ring,
        all: readings.map((r) => ({ column: r.column, paintedPx: r.paintedPx })),
      };
    },
    {
      png: shot.toString("base64"),
      columns,
      scanTop,
      scanBottom,
      outer,
      inner,
      elementTop: top,
      offset: style.outlineOffset,
      ring: ringRgb,
      contrastSrc: CONTRAST,
    },
  );

  return {
    focusVisible: style.focusVisible,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineOffset: style.outlineOffset,
    outlineColor: style.outlineColor,
    outlineAlpha: style.outlineAlpha,
    ...measured,
    capture: {
      rect: `${style.rect.x},${style.rect.y} ${style.rect.w}x${style.rect.h}`,
      column: measured.column,
      scrollY: style.scrollY,
    },
  };
}

/** The four checks every focused element must pass, with useful failures. */
function assertAccessibleRing(reading: RingReading, label: string) {
  expect(reading.focusVisible, `${label}: the element must match :focus-visible`).toBe(true);
  expect(reading.outlineStyle, `${label}: the outline must be drawn`).not.toBe("none");
  expect(
    reading.outlineWidth,
    `${label}: SC 2.4.13 wants a 2px-equivalent perimeter`,
  ).toBeGreaterThanOrEqual(2);
  expect(
    reading.outlineOffset,
    `${label}: the ring must sit beside the element, not over its own fill`,
  ).toBeGreaterThanOrEqual(1);
  expect(
    reading.outlineAlpha,
    `${label}: the ring colour must be opaque, got ${reading.outlineColor}`,
  ).toBe(1);
  expect(
    reading.paintedPx,
    `${label}: expected a 2px painted ring, got ${reading.paintedPx}px — rect=${reading.capture.rect} column=${reading.capture.column} scrollY=${reading.capture.scrollY} band=${JSON.stringify(reading.band)}`,
  ).toBeGreaterThanOrEqual(1.5);
  const worst = Math.min(reading.contrast.inside, reading.contrast.outside);
  expect(
    worst,
    `${label}: ${reading.contrast.inside}:1 against the gap ${JSON.stringify(reading.inside)} and ${reading.contrast.outside}:1 against the far side ${JSON.stringify(reading.outside)} — ring painted as ${JSON.stringify(reading.ringColor)}, token asks for ${JSON.stringify(reading.authored)} (needs ${MIN_CONTRAST}:1)`,
  ).toBeGreaterThanOrEqual(MIN_CONTRAST);
}

test.describe("focus ring contrast (WCAG 2.2 SC 1.4.11 / 2.4.13)", () => {
  test("the sign-in form paints a ≥3:1 ring on every kind of control", async ({ page }) => {
    await page.goto("/auth");

    const controls: [string, Locator][] = [
      ["email input", page.getByLabel(/^Email address/)],
      ["password input", page.getByLabel(/^Password/)],
      ["password reveal toggle", page.getByRole("button", { name: /Show password/ })],
      ["submit button (accent fill)", page.locator("form").getByRole("button", { name: "Sign in" })],
      ["mode switch", page.getByRole("button", { name: "Sign up" })],
      ["footer link", page.getByRole("link", { name: "Privacy policy" })],
    ];

    const worst: { label: string; ratio: number; ring: string; bg: number[] }[] = [];

    for (const [label, locator] of controls) {
      const reading = await readRing(page, await focusWithRing(page, locator));
      assertAccessibleRing(reading, `/auth ${label}`);
      const ratio = Math.min(reading.contrast.inside, reading.contrast.outside);
      worst.push({ label, ratio, ring: reading.ringColor.join(","), bg: reading.inside });
    }

    // The filled submit button is the interesting one: its own fill is the same
    // accent the ring is drawn in, so the ring can only be visible because the
    // 2px offset leaves a band of page between the two. Assert that band exists
    // and is the surrounding surface rather than the button's fill.
    const submit = await readRing(
      page,
      await focusWithRing(page, page.locator("form").getByRole("button", { name: "Sign in" })),
    );
    const accent = submit.outlineColor.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const distance = (a: number[], b: number[]) =>
      Math.sqrt(a.reduce((sum, c, i) => sum + (c - b[i]) ** 2, 0));
    expect(
      distance(submit.inside, accent),
      "the gap between the ring and the accent fill must not be the accent itself",
    ).toBeGreaterThan(40);
    expect(
      distance(submit.fill ?? accent, accent),
      "the submit button's own fill should be the accent",
    ).toBeLessThan(40);

    // Reported, not asserted: the floor across every control, so a regression
    // shows the direction it moved even when it is still above 3:1.
    const floor = worst.reduce((min, w) => (w.ratio < min.ratio ? w : min));
    console.log(
      `focus ring floor on /auth: ${floor.ratio}:1 (${floor.label}) · ring rgb(${floor.ring}) on [${floor.bg}]`,
    );
  });

  test("the signed-in console paints a ≥3:1 ring on rail links and page controls", async ({ page }) => {
    await signIn(page, ACCOUNTS.admin);
    // On a retry `signIn` replays a cached JWT through `addInitScript` and
    // returns without navigating, so waiting for the post-sign-in redirect
    // would time out against `about:blank`. Land on the console explicitly when
    // the helper did not already take us there.
    if (!page.url().startsWith("http")) await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
    await page.goto("/admin/settings");
    const rail = page.getByRole("complementary", { name: "Primary" });

    const controls: [string, Locator][] = [
      ["rail link", rail.getByRole("link", { name: "Users" })],
      ["rail settings link", rail.getByRole("link", { name: "Settings" }).first()],
      ["page button", page.getByRole("main").getByRole("button").first()],
      ["text input", page.getByLabel("Site name")],
      ["checkbox", page.getByRole("main").getByRole("checkbox").first()],
    ];

    let floor = Number.POSITIVE_INFINITY;
    for (const [label, locator] of controls) {
      const reading = await readRing(page, await focusWithRing(page, locator));
      assertAccessibleRing(reading, `console ${label}`);
      floor = Math.min(floor, reading.contrast.inside, reading.contrast.outside);
    }
    console.log(`focus ring floor in the console: ${floor}:1`);
  });
});
