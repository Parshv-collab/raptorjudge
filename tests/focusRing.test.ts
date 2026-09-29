import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The focus ring is the one indicator every keyboard user depends on, and
 * WCAG 2.2 puts a number on it twice: SC 1.4.11 (Non-text Contrast) and SC
 * 2.4.13 (Focus Appearance) both want **3:1 against the colours around it**.
 *
 * This ring used to be the accent at 40% alpha, which measured 1.70:1 on the
 * canvas — and 1.70:1 on surface-1 and surface-2 too, because a translucent
 * colour composites toward the background it is painted on. So the indicator
 * failed on every surface in the system, and the `rgba()` in
 * `src/index.css` meant nobody reading that rule could tell it had.
 *
 * These tests pin the three things that made it measurable, so the failure
 * cannot come back quietly:
 *
 *   1. the `--focus-ring` token is an opaque `outline` shorthand ≥ 2px wide;
 *   2. the colour it resolves to clears 3:1 against every surface a focus ring
 *      can land on (canvas, surface-1, surface-2);
 *   3. the single global rule actually consumes the token, keeps a non-zero
 *      `outline-offset` (so the ring is drawn *beside* an element rather than
 *      over its own fill), and no source file reintroduces a translucent
 *      accent ring through a Tailwind alpha modifier.
 *
 * The accent-on-accent case (a focused primary button, whose fill is the same
 * accent) is safe because of the offset, which is why (3) asserts it.
 */

const ROOT = join(__dirname, "..");
const TOKENS_CSS = join(ROOT, "src/styles/design-tokens.css");
const INDEX_CSS = join(ROOT, "src/index.css");

/** WCAG 2.x relative luminance of an sRGB triple, channels in 0..1. */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio between two opaque sRGB triples. */
function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Channels are 0..1 everywhere below — `luminance` is defined in that domain. */
type Rgb = [number, number, number];

/** `#rrggbb` / `#rgb` → triple in 0..1. */
function parseHex(value: string): Rgb {
  const h = value.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) throw new Error(`not a hex colour: ${value}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
}

/**
 * `rgb()` / `rgba()` → triple in 0..1 plus the alpha, which may be written as
 * a percentage. 255 and `100%` both mean "full channel".
 */
function parseRgba(value: string): { rgb: Rgb; alpha: number } {
  const parts = value
    .replace(/rgba?\(/, "")
    .replace(/\)/, "")
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((part) => (part.endsWith("%") ? parseFloat(part) / 100 : parseFloat(part) / 255));
  const [r, g, b, a = 1] = parts;
  return { rgb: [r, g, b], alpha: a };
}

/** Every `--name: value;` custom property in a stylesheet. */
function readCustomProperties(css: string): Map<string, string> {
  const props = new Map<string, string>();
  // Comments are stripped first so a value quoted inside one is never parsed.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of stripped.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    props.set(match[1], match[2].trim());
  }
  return props;
}

/**
 * Resolve a token to an opaque colour, following one level of `var(--…)` and
 * rejecting transparency — a translucent ring is the bug this file exists for.
 */
function resolveOpaque(
  props: Map<string, string>,
  token: string,
  seen: string[] = [],
): Rgb {
  const raw = props.get(token);
  if (raw === undefined) throw new Error(`missing custom property ${token}`);
  if (seen.includes(token)) throw new Error(`circular reference at ${token}`);

  const ref = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (ref) return resolveOpaque(props, ref[1], [...seen, token]);

  if (raw.startsWith("#")) return parseHex(raw);
  const fn = raw.match(/^rgba?\(/i);
  if (fn) {
    const { rgb, alpha } = parseRgba(raw);
    if (alpha < 1) {
      throw new Error(`${token} is translucent (alpha ${alpha}); a focus ring must be opaque`);
    }
    return rgb;
  }
  throw new Error(`cannot resolve ${token} to a colour from ${JSON.stringify(raw)}`);
}

/** `--focus-ring: <width> <style> <colour>` — the `outline` shorthand. */
function parseRingShorthand(value: string): { widthPx: number; style: string; color: string } {
  const parts = value.split(/\s+/);
  const width = parts[0];
  const widthPx = width.endsWith("px") ? parseFloat(width) : NaN;
  if (Number.isNaN(widthPx)) {
    throw new Error(`--focus-ring width is not in px: ${value}`);
  }
  return { widthPx, style: parts[1] ?? "", color: parts.slice(2).join(" ") };
}

/** Every file under a directory, recursively. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const tokens = readCustomProperties(readFileSync(TOKENS_CSS, "utf8"));
const indexCss = readFileSync(INDEX_CSS, "utf8");

/** The ring's colour, resolved through the shorthand and any `var()` inside. */
function ringColor(): Rgb {
  const { color } = parseRingShorthand(tokens.get("--focus-ring")!);
  const props = new Map(tokens);
  props.set("--__ring_color", color);
  return resolveOpaque(props, "--__ring_color");
}

/** Surfaces a focus ring can be painted on: the page and both raised panels. */
const SURFACES = ["--color-bg", "--color-surface-1", "--color-surface-2"] as const;

describe("focus ring tokens (WCAG 2.2 SC 1.4.11 / 2.4.13 want 3:1)", () => {
  it("--focus-ring is an opaque outline at least 2px wide", () => {
    const raw = tokens.get("--focus-ring");
    expect(raw, "--focus-ring is declared in src/styles/design-tokens.css").toBeDefined();
    const { widthPx, style } = parseRingShorthand(raw!);
    expect(widthPx).toBeGreaterThanOrEqual(2);
    expect(["solid", "double"]).toContain(style);
    // resolveOpaque throws on an alpha < 1, which is the whole point.
    expect(() => ringColor()).not.toThrow();
  });

  it("clears 3:1 against every surface it can be painted on", () => {
    const ring = ringColor();
    for (const surface of SURFACES) {
      const background = resolveOpaque(tokens, surface);
      const ratio = contrast(ring, background);
      // The message names the surface, so a failure says which one regressed.
      expect(
        ratio,
        `focus ring on ${surface}: ${ratio.toFixed(2)}:1 (needs 3:1)`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("is a ring, not a fill: it is strictly lighter than every surface", () => {
    const ring = ringColor();
    for (const surface of SURFACES) {
      expect(luminance(ring)).toBeGreaterThan(luminance(resolveOpaque(tokens, surface)));
    }
  });
});

describe("the one global focus rule", () => {
  it("consumes the token instead of restating a colour", () => {
    const rule = indexCss.match(/:focus-visible\s*\{([^}]*)\}/);
    expect(rule, "src/index.css keeps a :focus-visible rule").toBeTruthy();
    const body = rule![1];
    expect(body).toMatch(/outline:\s*var\(--focus-ring\)/);
    // A raw rgba() outline here is exactly how the 1.70:1 ring shipped.
    expect(body).not.toMatch(/outline:[^;]*rgba?\(/);
  });

  it("keeps a non-zero outline-offset so the ring sits beside the element", () => {
    const body = indexCss.match(/:focus-visible\s*\{([^}]*)\}/)![1];
    const offset = body.match(/outline-offset:\s*(\d+)px/);
    expect(offset, "an explicit px outline-offset is set").toBeTruthy();
    // With the ring drawn over the element's own fill, a focused accent-filled
    // button would have a 1:1 "indicator" against itself.
    expect(parseInt(offset![1], 10)).toBeGreaterThanOrEqual(1);
  });
});

describe("no translucent focus ring anywhere in src/", () => {
  const sources = walk(join(ROOT, "src")).filter((f) => /\.(tsx?|css)$/.test(f));

  it("has no Tailwind accent ring with an alpha modifier", () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/(outline|ring)-accent\/(\d+)/g)) {
        if (Number(match[2]) < 100) {
          offenders.push(`${file.replace(ROOT, ".")}: ${match[0]}`);
        }
      }
    }
    expect(offenders, `translucent focus rings: ${offenders.join(", ")}`).toEqual([]);
  });

  it("has no translucent outline declared in CSS", () => {
    const offenders: string[] = [];
    for (const file of sources.filter((f) => f.endsWith(".css"))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/outline:\s*([^;]+);/g)) {
        const value = match[1];
        if (!/var\(--focus-ring\)/.test(value) && /rgba\([^)]*,\s*0?\.\d+\s*\)/.test(value)) {
          offenders.push(`${file.replace(ROOT, ".")}: ${value.trim()}`);
        }
      }
    }
    expect(offenders, `translucent outlines: ${offenders.join(", ")}`).toEqual([]);
  });
});

/**
 * A ring can be fully opaque in the token and still arrive dimmed.
 *
 * `.auth-grid` masks its background grid to a soft pool. A `mask` applies to an
 * element's whole subtree, so it applied to the sign-in card too: at the edges
 * of the pool the card, its controls and the ring drawn around them were all
 * composited at 77–93% alpha. The browser verified the regression before this
 * test existed — the sign-in button's ring measured 4.60:1 instead of 5.17:1
 * and the mode switch's only 3.38:1, a hair above the 3:1 floor with no margin
 * for it. The pattern now lives on a masked `::before` behind the content.
 */
describe("nothing composites over the focus ring", () => {
  const css = readFileSync(join(ROOT, "src/index.css"), "utf8");

  it("keeps masks and filters off any element that contains controls", () => {
    const offenders: string[] = [];
    // Any rule whose selector is a plain class (not a pseudo-element) and that
    // declares a mask/filter/opacity is compositing over whatever it contains.
    for (const match of css.matchAll(/^\s{2}\.([\w-]+)\s*\{([^}]*)\}/gm)) {
      const [, selector, body] = match;
      if (/(^|[^-])mask-image\s*:|(^|[^-])filter\s*:|(^|[^-])opacity\s*:/.test(body)) {
        offenders.push(`.${selector}`);
      }
    }
    expect(
      offenders,
      `these selectors composite over their own subtree, which dims any focus ring inside them: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("puts the sign-in backdrop pattern on a ::before, not on the card's parent", () => {
    const block = css.match(/\.auth-grid::before\s*\{([^}]*)\}/);
    expect(block, "the auth backdrop pattern must live on .auth-grid::before").not.toBeNull();
    expect(block![1]).toMatch(/mask-image\s*:/);
    const element = css.match(/\.auth-grid\s*\{([^}]*)\}/);
    expect(element![1], ".auth-grid itself must not carry a mask").not.toMatch(/mask-image/);
  });
});
