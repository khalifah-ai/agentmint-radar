# How this radar works

## The question

A protocol with no token is a bet: if it launches one, what is the token worth,
and how likely is the launch? This radar prices 198 pre-token protocols from the
snapshot's own figures.

## The formula

**Implied value = value if it launches x token odds.**

The value if it launches comes from the 92 live tokens that are standalone
protocols with a positive market cap: log10(value) = 3.9578 + 0.3940 x
log10(TVL) - 1.994 x log10(1 + 0.03 x min(chains - 1, 5)). A chain-count term
survived the ablation; family, category, growth and age did not. The token
odds come from a logistic regression on all 442 peers (198 ranked + 244
standalone tokens): logit = -4.318 + 0.761 x years listed + 3.308 x undated +
0.150 x ln(TVL) - 4.430 x market-relative growth + 3.009 x kinship. Undated
means no listing date in the snapshot; kinship means the protocol shares a
first word with another token protocol.

## How it was tested

Every number below is out of sample — the row being priced was never in its own
fit. Leave-one-out on the 92 live tokens: median miss x3.02 (flat x4.65).
Walk-forward, tokens listed before 2024-07-15 pricing the 35 listed after:
median miss x2.04 (flat x4.52). Odds: leave-one-out Brier 0.184 vs base 0.247,
accuracy 74% vs 55%; walk-forward Brier 0.218 vs 0.415. A control term —
another row's growth — hurts both models, as a control must. Term selection was
redone inside each split (nested validation): the re-selected models score
worse than the fixed rule on both outer tests, so the fixed rule ships and the
comparison is shown.

## The ranges

Each row prints a P25-P75 band from the leave-one-out residuals (x0.38 to
x4.11). Leave-one-out coverage: 49% inside P25-P75 (stated 50%), 78% inside
P10-P90 (stated 80%). Walk-forward: 57% and 63% — the wide band is too narrow
for recent listings, and the page says so.

## The verdicts

A farm plan is 0.02% of TVL (floor $1K, cap $20K), 6 transactions, 1.1 hours,
and an assumed 5% airdrop shared across the whole pool. The verdict is made on
the P25 case: FARM if the P25 net is at least $15 an hour, MARGINAL if it is at
least zero, SKIP otherwise. 22 FARM, 164 MARGINAL, 12 SKIP. The sliders
recompute every verdict live.

## What this radar does not know

The curve's R-squared is 0.11: TVL and chain count explain little of a token's
market cap, and the P10-P90 band is 107x wide. The odds are the peers' record,
not a forecast — 31% of peers listed under a year record a token, 86% of those
listed over three years do. Kinship rests on 7 ranked rows, and its
bootstrap spread is wide. No parent discount is applied: the snapshot cannot
say which pre-token protocols are subsidiaries, so off-list rows that look like
one carry a badge instead. The snapshot is frozen at 2026-11-14; nothing here
updates.
