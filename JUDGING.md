# Judging

## Rubrics

A rubric is a set of `rubricCriteria` rows attached to an event. Each criterion has a name, description, weight, minimum score, maximum score, and sort order. Organizers create or edit criteria with `judging.upsertCriterion`. The mutation requires organizer authorization. The source does not provide a separate lock mutation; rubric immutability after judging starts is **not implemented**. The UI advises organizers to keep total weights at 100%, but the mutation itself does not enforce the sum.

## Assignment algorithm

`src/lib/algorithms/assignment.ts` performs two passes. First, it initializes every judge's workload to zero and computes conflict teams. A judge's own teams and every team sharing one of those members are conflicts. Submissions are processed round-robin. For each submission, candidates must be eligible and not already assigned to that submission. Candidates are sorted by ascending workload, then by track affinity, then by seeded random jitter. The planner assigns candidates until the configured minimum `k` is reached, defaulting to 3. If no eligible candidate remains, it records a conflict message and leaves `minJudgesMet` false.

Second, the planner repeatedly looks for a light judge and a heavy judge whose workload difference is greater than one. It swaps an assignment when the light judge is eligible and not already assigned. The loop has a guard of 100 iterations. The result includes assignments, workload, total assignments, whether every submission reached `k`, and human-readable conflicts. The seed defaults to 42 for deterministic tie-breaking. The judge affinity input is a list of track names. Conflict-of-interest prevention is based on team membership; organization-level conflicts are only represented if the caller encodes them into the team membership input.

## Scoring

A judge scores each assigned submission for every rubric criterion. The stored raw score is the slider value bounded by the criterion's minimum and maximum. The per-submission raw mean is the arithmetic mean of available judge scores. The normalized weighted score used by the UI is the sum of `score × criterion.weight` across criteria. `submitScores` stores one score row per assignment and criterion and marks the assignment complete when all criteria are present. A completed assignment cannot be reopened by the judge.

## Normalization

`normalizeScores` computes each judge's mean `mu` and sample standard deviation `sigma`, where the denominator is `n - 1`. For each submission, the z-score path uses:

```text
z = (raw - mu_j) / sigma_j
zNormalized = mean(z across available judges) × targetSigma + targetMean
```

The defaults are `targetMean = 75` and `targetSigma = 12`. If a judge has zero variance, that judge's z contribution is zero. The min-max companion method maps each judge's observed range to `[0, 100]` using `(raw - lo) / (hi - lo) × 100`; a flat range maps to 50. The Bayesian companion uses prior weight `k = 10` and prior mean equal to the global mean unless overridden:

```text
adjusted = (n × raw + k × priorMean) / (n + k)
```

The final Bayesian value is the mean of the adjusted values available for the submission. The implementation does not contain a MAD-based method, so MAD normalization is **not implemented**. The implementation does not choose one method conditionally; it computes z-score, min-max, and Bayesian variants together. Proof metrics include maximum judge mean error, maximum judge standard-deviation error, Spearman rho between raw and z rankings, and Spearman rho between z and min-max rankings.

## Final ranking and ties

The normalization result sorts submissions by descending z-normalized score. Rank deltas compare raw mean rank with z-normalized rank and use average ranks for equal values. A separate final-score policy combining all normalization methods is **not implemented**; the source exposes all variants and treats z-normalized ordering as the primary output.

## Bradley–Terry pairwise ranking

`bradleyTerry` aggregates wins and match counts. A tie contributes 0.5 wins to both submissions. Ratings start at 1. The MM update is:

```text
pi_i(next) = (W_i + a - 1) / (b + sum_j(n_ij / (pi_i + pi_j)))
```

The default Gamma prior parameters are `a = 1.5` and `b = 1`. The default maximum is 500 iterations and convergence is declared when the absolute log-likelihood change is below `1e-10`. Ratings are rescaled so the smallest positive rating is 100. Ranking sorts descending by rating. The displayed win probability is each rating divided by itself plus the weakest positive rating. The next-match selector prefers close ratings and pairs that have been played fewer times.

## CSV exports

`src/convex/exports.ts` supplies CSV or JSON responses for event data. The documented export families are submissions, scores, rankings, assignments, and event JSON. Exact columns are derived by the implementation at response construction time; a versioned export schema is **not implemented**. The organizer dashboard exposes these export operations through its advanced source components.

## References

[1]: src/lib/algorithms/assignment.ts "Judge assignment planner"
[2]: src/convex/judging.ts "Rubrics, assignments, queues, and score mutations"
[3]: src/lib/algorithms/normalization.ts "Cross-judge normalization"
[4]: src/lib/algorithms/pairwise.ts "Bradley–Terry MM and next-match selection"
[5]: src/convex/exports.ts "CSV and event export functions"
