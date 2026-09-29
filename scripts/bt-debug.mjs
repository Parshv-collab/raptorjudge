import { bradleyTerry } from "../src/lib/algorithms/pairwise.ts";
import { mulberry32 } from "../src/convex/crypto.ts";

const SEED = 20260420;
const rng = mulberry32(SEED);
// burn rng exactly like the seeder does before matches are drawn
for (let i = 0; i < 12; i++) rng(); // users loop approx
// Not exact — instead, test the raw distribution directly:

const N = 12;
const items = Array.from({ length: N }, (_, i) => `s${i}`);
const matches = [];
const rng2 = mulberry32(12345);
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    if (rng2() < 0.45) {
      const qualityI = 5.5 + ((i * 37) % 40) / 10;
      const qualityJ = 5.5 + ((j * 37) % 40) / 10;
      const pWinI = qualityI / (qualityI + qualityJ);
      matches.push({ submissionAId: items[i], submissionBId: items[j], winnerId: rng2() < pWinI ? items[i] : items[j] });
    }
  }
}
console.log("matches:", matches.length);
const r = bradleyTerry(matches, items);
console.log("converged:", r.converged, "iters:", r.iterations, "ll:", r.logLikelihood.toFixed(4));
