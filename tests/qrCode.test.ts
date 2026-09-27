import { describe, expect, it } from "vitest";
import { qrMatrix } from "../src/components/ui/QrCode";

/**
 * Structural invariants for the hand-rolled QR encoder (issue 28). A decoder
 * would be the gold standard; these checks pin the parts of the spec a broken
 * encoder most often gets wrong, so an authenticator-app scan failure has a
 * failing unit test instead of a mystery.
 */

function expectMatrix(text: string): boolean[][] {
  const m = qrMatrix(text);
  expect(m).not.toBeNull();
  return m as boolean[][];
}

describe("qrMatrix", () => {
  it("produces a square matrix of the spec size for the version", () => {
    const uri = "otpauth://totp/RaptorJudge:admin%40fixture.local?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    // 88 bytes → version 5 (capacity 107, ECC L) → 37×37.
    expect(new TextEncoder().encode(uri).length).toBe(88);
    const m = expectMatrix(uri);
    expect(m.length).toBe(37);
    for (const row of m) expect(row).toHaveLength(37);
  });

  it("keeps finder patterns intact in all three corners", () => {
    const m = expectMatrix("hello");
    const n = m.length;
    const checkFinder = (r0: number, c0: number) => {
      for (let r = 0; r <= 6; r++) {
        for (let c = 0; c <= 6; c++) {
          const expected =
            r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          expect(m[r0 + r][c0 + c]).toBe(expected);
        }
      }
    };
    checkFinder(0, 0);
    checkFinder(0, n - 7);
    checkFinder(n - 7, 0);
  });

  it("renders the alternating timing pattern on row/column 6", () => {
    const m = expectMatrix("hello");
    const n = m.length;
    for (let i = 8; i < n - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });

  it("sets the dark module at (size-8, 8)", () => {
    const m = expectMatrix("hello");
    expect(m[m.length - 8][8]).toBe(true);
  });

  it("scales up to a long otpauth URI within version 10", () => {
    const long = `otpauth://totp/RaptorJudge:user%40example.com?secret=${"A".repeat(32)}&issuer=RaptorJudge&algorithm=SHA1&digits=6&period=30`;
    const m = expectMatrix(long);
    expect(m.length).toBeGreaterThan(21);
  });

  it("returns null rather than overflowing past version 10", () => {
    expect(qrMatrix("x".repeat(300))).toBeNull();
  });

  it("is deterministic for the same input", () => {
    expect(qrMatrix("deterministic")).toEqual(qrMatrix("deterministic"));
  });
});
