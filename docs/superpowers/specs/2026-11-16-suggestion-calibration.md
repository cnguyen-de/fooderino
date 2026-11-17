# Buy suggestion calibration

The owner wants Fooderino to suggest what to buy from how often the household buys it ("we buy
milk every week, so suggest milk next week"). The design says the thresholds get tuned against
real history, not guessed. This note records that tuning against the legacy log export.

## Result

`DEFAULT_RULES` changes from `dueFraction 0.8, minPurchaseDays 3, windowDays 182` to
**`dueFraction 0.6, minPurchaseDays 2, windowDays 182`**. `useSoonDays` stays 3.

At N = 7 (an item counts as needed when it is bought in the 7 days from the simulated day):

| Rules | Precision | Recall | F1 | Suggestions per week |
| --- | --- | --- | --- | --- |
| Old (0.8, 3, 182) | 15.7% (33/210) | 6.4% (34/532) | 0.091 | 3.1 |
| New (0.6, 2, 182) | 11.2% (65/578) | 12.8% (68/532) | 0.120 | 8.6 |

The new rules double recall and roughly double correct suggestions per week (0.5 to 1.0). The
cost is precision: 8.6 suggestions a week instead of 3.1, and about 1 in 9 is bought that week.
Both numbers are low. The rule thresholds are not what limits them. The household's recorded
buying is (see "What limits the numbers").

## Command

```sh
npx tsx scripts/calibrate-suggestions.ts /Users/chi/Coding/MaySolutions/fooderino/logs-export-2026-11-16.json
```

The run is deterministic (fixed bootstrap seed, `TZ` defaults to `Europe/Berlin`) and takes about
7 s. The export holds user emails. The script never reads the `user` field and prints only
aggregates and item names. Keep the export out of the repo.

## Method

- **Parse.** This follows migration step 4: `action in ('updated', 'inventory')`, the anchored
  payload regex, and items keyed by `normName` within the list. An increase becomes
  `purchase(b - a)` and a decrease `consume(a - b, after = b)`. Without the items table, the
  items are the names that each list's logs mention. A name whose last created/deleted row is a
  delete counts as unmatched, as it would in the migration. The script asserts
  `rows = events + audit`.
- **Stock.** Treated as unknown. On each simulated day, an item's `amount` is the `b` of its last
  parsed row before that day. `to_buy` is 0, and the bag and dismissals are empty.
- **Walk.** 68 Saturdays from 2025-08-02 to 2026-11-14. Saturday is the busiest purchase day. The
  real `suggest()` sees only events from before the simulated day. A day is scored at horizon N
  only when `[d, d+N)` ends by the last export day.
- **Metrics.** Precision is the share of `(day, item)` suggestions bought in `[d, d+N)`. Recall
  is the share of purchase days that fall in some walk day's `[d, d+N)` and whose item was
  suggested on that walk day.
- **Decision rule, fixed before the first run.** Maximize F1 at N = 7. Move off the current
  rules only when a paired bootstrap over walk weeks (2,000 resamples) gives a 95% interval for
  the F1 gain that excludes zero.

## Parse audit

2,566 rows give 1,571 events (688 purchase, 883 consume) plus 995 audit rows:

- **other_action, 195.** These are 181 `created` and 14 `deleted` rows.
- **unparseable, 705.** These are 682 empty payloads, 18 `undefined → N`, 3 `N → NaN` and 2 `null → N`.
- **unmatched, 85.** These are rows of 13 items that were deleted and never re-created.
- **zero_delta, 10.**

Items: 362 in the main list, 69 in the second, 3 in the third (created rows only). `normName`
folds 12 names that appear in two spellings, mostly trailing spaces and case.

**Migration finding.** The unmatched bucket holds `Eggs`, the second most bought item (27
purchase days). It was deleted on 2026-08-15, and `Egg` was created the same day. The migration
will send its whole history to audit, so `Egg` starts with no cadence. Keeping deleted items
lifts precision for the new rules from 11.2% to 12.0% and recall from 12.8% to 13.6%. It does
not change the choice. A plural fold or a manual merge before backfill would save that history.

## Can shopping-list edits be told apart from stock changes?

**Yes, with high confidence.** The payload tells them apart.

- **Code.** The legacy client (`app/store/item.ts` on `main`, unchanged in this respect since
  the log payload landed on 2025-05-11, the export's first day) writes `a → b` only when the
  home `amount` changed. `updateItem` sets the payload only if `item.amount !== data.amount`.
  `addItemToInventory` (shopping checkout) always writes `amount → amount + amount_to_purchase`.
  An edit of `amount_to_purchase` alone (the shopping list number field) logs `updated` with an
  empty payload. A list edit from the all-lists shopping view logs `undefined → N`, because the
  item is missing from the selected list's cache. `addItemToBuy` logs nothing.
- **Data.** Both list-edit shapes fail the anchored regex, so they land in the unparseable audit
  bucket and never become events. The empty-payload rows behave like list edits. The item's next
  stock row within 14 days is an increase 46.8% of the time, against 17.5% after an ordinary
  stock row.
- **Residual noise in the parsed rows.** Of 1,244 consecutive stock rows per item, 1,166 chain
  (`a` equals the previous `b`). Another 35 are debounce overlaps. The client compares against a
  cached list, and since 2025-12-06 it refetches only after a debounce, so quick taps logged
  `4 → 3, 4 → 1, 4 → 2, 4 → 0` for one walk from 4 to 0. All but 2 overlaps date from after that
  change. They inflate quantities, not purchase days. Collapsing them changes 2 of 578
  suggestions and no metric by more than 0.1 points. The other 43 breaks are more than a minute
  apart, and their cause is not established.

Not separable: a home `+1` that restocks without the list, or a recount correction, still reads
as a purchase. Nothing in the payload marks either one.

## Sanity checks on the metric

| Policy at N = 7 | Precision | Recall | Per week |
| --- | --- | --- | --- |
| Everything bought before | 2.5% | 65.4% | 200.6 |
| Bought in the last 7 days | 4.5% | 4.9% | 8.0 |
| Nothing | n/a | 0% | 0 |
| Every item with a cadence (mpd 2, 182 days), every week | 7.1% | 37.0% | 39.5 |
| New rules | 11.2% | 12.8% | 8.6 |

- Suggesting everything scores the base rate, 2.5%. That is also what a random pick of any size
  scores, so the new rules lift precision 4.5x. Its recall is not 100% because 35% of purchases
  are of items never bought before that day.
- The "last week again" rule barely beats the base rate. Weekly repeats are rare in this
  history, which matches the gap statistics below.
- Due timing adds precision over "has a cadence" (11.2% against 7.1%) at the same F1.
- **Halves.** The new rules beat the old on F1 in both halves of the walk: 0.129 against 0.096
  for Aug 2025 to Mar 2026, and 0.108 against 0.085 for Mar to Nov 2026. The choice is not fit
  to one stretch.
- **Walk weekday.** Moving the walk to another weekday keeps precision between 10.1% and 11.3%
  and recall between 11.2% and 12.8%.
- **Horizons.** At N = 3 the old rules score 11.4% / 7.4% and the new 7.4% / 13.2%. At N = 14
  the old score 26.1% / 7.5% and the new 19.6% / 15.4%.

## Sweep

19 of the 45 settings are within noise of the best F1. `dueFraction` moves F1 by about 0.01
within a fixed `minPurchaseDays` and `windowDays`. Volume comes from `minPurchaseDays` and
`windowDays`. A 91-day window starves the cadence (recall at most 5.8%). The precision/recall
frontier, from most recall to most precision:

| Setting (df, mpd, window) | Precision | Recall | Per week |
| --- | --- | --- | --- |
| 0.6, 2, 365 | 8.5% | 17.3% | 15.4 |
| **0.6, 2, 182 (new)** | 11.2% | 12.8% | 8.6 |
| 0.6, 3, 365 | 11.5% | 12.2% | 8.2 |
| 0.6, 4, 365 | 15.2% | 9.6% | 4.8 |
| 1.0, 4, 365 | 16.5% | 7.7% | 3.5 |
| 0.6, 4, 182 | 20.4% | 4.5% | 1.7 |
| 0.6, 4, 91 | 40.7% | 2.3% | 0.4 |

The old setting (15.7%, 6.4%) is not on the frontier. `0.6, 4, 365` matches its precision with
50% more recall. If a shorter list matters more to the owner than catching purchases, pick that
setting. It is within noise of the best F1. The pre-registered rule picked `0.6, 2, 182`.

## What limits the numbers

**Recall.** Of the 464 purchases the new rules miss:

- 233 (50%) are of an item with no purchase in the window yet.
- 102 (22%) are of an item with only one purchase day. No cadence rule can predict either kind.
- 67 (14%) were due, but reconstructed stock covered a typical purchase.
- 62 (13%) were not due yet.

The ceiling for any rule with this window and minimum is 37% (every item with a cadence,
every week).

**Precision.** Of the 513 false positives:

- 346 (67%) are of an item bought again only 14 or more days later. The rule calls it due, but
  the household waits longer.
- 120 (23%) are of an item never bought again.
- 47 (9%) are of an item bought 7 to 13 days later.

Suggestions new that week score 21.7%. Repeats of an ignored suggestion pull the total down,
because the simulation never dismisses. In the app, a dismiss snoozes the item for one cycle, so
the precision a user sees should land between 11% and 22% (inferred, not measured).

**The limiter is the shape of the history.** Neither list-edit noise nor a weekly-trip rhythm
explains the low numbers:

- Most items are bought rarely. 133 of the 257 bought items have one purchase day. The median
  gap between an item's purchase days is 53 days. The most bought item, `Tomato`, has 29
  purchase days in 18 months.
- Gaps are irregular. The 44 items with three or more gaps have a median coefficient of
  variation of 0.76.
- There is no single weekly trip. Saturday holds 246 of 657 item purchase days (37%), and
  Monday to Friday hold 63 to 85 each. Only 19% of gaps are whole weeks.
- The export has no "milk every week" item. `Lactose free milk` has 10 purchase days.

**Noise does not dominate.** List edits never parse. Collapsing debounce overlaps moves nothing.
Keeping deleted items moves the new rules' metrics by under one point.

Top false positives: Kohlrabi (36), Lime (30), Giá (28), Spinat (26), Ba chỉ miếng (21), Bắp bò
thái mỏng (21), Paprika (21), Đùi gà lọc xg (20).
Top missed items: Bắp bò (11), Butter (11), Tomato (11), Gurken (10), Thịt lợn băm (9), Xương
lợn (8), Bún (7), Carrot (7).
Top correct suggestions: Tomato (12), Carrot (5), Cherry tomatoes (5), Gurken (5), Lime (5), Giá
(3), Lactose free milk (3).

## Behavior changes from the new defaults

- With `minPurchaseDays 2`, a single gap makes a cadence. An item bought twice shows in Probably
  need when due, and no longer in Ran out when it hits 0.
- With `dueFraction 0.6`, an item with a 7-day gap is due after 5 days, and one with a 14-day gap
  after 9.

`tests/unit/pantry-suggest.test.ts` now pins its own rules (0.8, 3, 182). Its behavior
assertions are unchanged, and they test rule semantics apart from the tuned defaults.

## Limits of this calibration

- One household, effectively one list (2,341 of 2,566 rows). Once real typed events accumulate,
  rerun the calibration on them.
- Stock is reconstructed. `to_buy`, the bag and dismissals are unknown. In the app, items
  already on the list are held back, which this simulation cannot do.
- Renamed items lose history. The log carries only the name at the time of each row.

## Owner-facing default (coordinator decision, 2026-11-17)

The shipped default is **`dueFraction 0.6, minPurchaseDays 4, windowDays 365`**, not the
best-F1 setting. The two tie on F1 (0.117 vs 0.120, within the bootstrap range). The shipped
one shows 4.8 suggestions a week at 15.2% precision, instead of 8.6 a week at 11.2%. A
"Probably need" section where 8 of 9 rows go unbought trains the owner to ignore it, so the
shorter, sharper list wins on experience. Rerun the script after a few months of typed events,
since the new app records purchases at the shop instead of inferring them from count edits.

## Expanded coverage (owner request, 2026-11-17)

The owner preferred more items after using Probably need. The current defaults are now
**`dueFraction 0.6, minPurchaseDays 2, windowDays 365`**. This supersedes the shorter-list
choice above: two distinct purchase days establish a repeat purchase pattern, rather than four.
Timing, stock coverage, bag/list exclusions and Skip snoozes are unchanged.

On the current Groceries snapshot, this expands the section from **8 to 22 items**, retaining
all eight existing suggestions. This is a present-day coverage check, not a new accuracy
measurement. The historical sweep above measured about 15.4 suggestions per week for these
settings, with the expected tradeoff of lower precision than the previous defaults.
