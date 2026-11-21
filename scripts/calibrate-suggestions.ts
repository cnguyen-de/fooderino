/**
 * Replays the legacy log export week by week through the real `suggest()` and scores
 * "Probably need" against what the household actually bought next.
 *
 *   npx tsx scripts/calibrate-suggestions.ts <path-to-logs-export.json>
 *
 * The export holds user emails. This script never reads the `user` field and prints only
 * aggregate numbers and item names.
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RULES, addDays, daysBetween, localDate, localDateOf, normName, suggest } from '../utils/pantry';
import type {
  CommandId,
  EventId,
  HouseholdId,
  Instant,
  Item,
  ItemEvent,
  ItemId,
  LocalDate,
  SuggestRules
} from '../utils/pantry';

// Purchase days fall into local calendar days, so the result depends on the zone. The household is in Germany.
process.env.TZ ??= 'Europe/Berlin';

const PAYLOAD = /^\s*(-?\d+(\.\d+)?)\s*(→|->)\s*(-?\d+(\.\d+)?)\s*$/;
const STOCK_ACTIONS = new Set(['updated', 'inventory']);
// The household's main trip day in this export (measured: the busiest purchase weekday), so each
// simulated day is the morning before a trip.
const WALK_START = localDate('2025-08-02');
const WALK_END = localDate('2026-11-15');
const HORIZONS = [3, 7, 14] as const;
const MAIN_N = 7;
const SWEEP = {
  dueFraction: [0.6, 0.7, 0.8, 0.9, 1.0],
  minPurchaseDays: [2, 3, 4],
  windowDays: [91, 182, 365]
};

interface LegacyRow {
  id: string;
  list_id: string;
  item: string;
  action: string;
  payload: string | null;
  created_at: string;
}

type AuditBucket = 'other_action' | 'unparseable' | 'unmatched' | 'zero_delta';

/** One parsed `a → b` row: a home stock change of one item. */
interface Change {
  id: string;
  list: HouseholdId;
  item: ItemId;
  at: Instant;
  day: LocalDate;
  a: number;
  b: number;
}

interface Dataset {
  items: Item[];
  /** Per list, the parsed changes in time order. Zero-delta rows stay here for stock, not as events. */
  changes: Map<HouseholdId, Change[]>;
  events: Map<HouseholdId, { event: ItemEvent; day: LocalDate }[]>;
  purchaseDays: Map<ItemId, LocalDate[]>;
  audit: Record<AuditBucket, number>;
  rows: number;
}

/** One day's view of a list: what `suggest()` would see on the morning of `day`. */
interface DayContext {
  day: LocalDate;
  list: HouseholdId;
  items: Item[];
  events: ItemEvent[];
}

/** Which items one policy put in Probably need, per walk day and list. */
type Picks = Map<LocalDate, Set<ItemId>>;

function readRows(path: string): LegacyRow[] {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('Expected a JSON array of log rows');
  return raw.map((r) => ({
    id: String(r.id),
    list_id: String(r.list_id),
    item: String(r.item ?? ''),
    action: String(r.action),
    payload: r.payload ?? null,
    created_at: String(r.created_at)
  }));
}

const keyOf = (list: string, name: string) => `${list}:${normName(name)}` as ItemId;

function blankItem(id: ItemId, list: HouseholdId, name: string): Item {
  return {
    id,
    household_id: list,
    name,
    aliases: [],
    tags: [],
    unit: 'count',
    default_amount: 1,
    shelf_life_days: null,
    season: null,
    amount: 0,
    to_buy: 0,
    best_before: null,
    merged_into: null,
    deleted_at: null
  };
}

/**
 * Migration step 4 over the export alone. Items are the normalized names a list's logs mention,
 * minus those whose last created/deleted row is a delete (the items table would not hold them).
 */
function parse(rows: LegacyRow[], { collapseOverlaps = false, keepDeleted = false } = {}): Dataset {
  const sorted = [...rows].sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));
  const lifecycle = new Map<ItemId, string>();
  const names = new Map<ItemId, { list: HouseholdId; name: string }>();
  for (const r of sorted) {
    const id = keyOf(r.list_id, r.item);
    names.set(id, { list: r.list_id as HouseholdId, name: r.item.trim() });
    if (r.action === 'created' || r.action === 'deleted') lifecycle.set(id, r.action);
  }
  const live = (id: ItemId) => keepDeleted || lifecycle.get(id) !== 'deleted';

  const audit: Record<AuditBucket, number> = { other_action: 0, unparseable: 0, unmatched: 0, zero_delta: 0 };
  const changes = new Map<HouseholdId, Change[]>();
  for (const r of sorted) {
    if (!STOCK_ACTIONS.has(r.action)) {
      audit.other_action++;
      continue;
    }
    const m = PAYLOAD.exec(r.payload ?? '');
    if (!m) {
      audit.unparseable++;
      continue;
    }
    const item = keyOf(r.list_id, r.item);
    if (!live(item)) {
      audit.unmatched++;
      continue;
    }
    const at = new Date(r.created_at).toISOString() as Instant;
    const change = { id: r.id, list: r.list_id as HouseholdId, item, at, day: localDateOf(at), a: +m[1]!, b: +m[4]! };
    const list = changes.get(change.list) ?? [];
    list.push(change);
    changes.set(change.list, list);
  }
  if (collapseOverlaps) for (const [list, xs] of changes) changes.set(list, collapse(xs));

  const events = new Map<HouseholdId, { event: ItemEvent; day: LocalDate }[]>();
  const purchaseDays = new Map<ItemId, LocalDate[]>();
  for (const [list, xs] of changes) {
    const out: { event: ItemEvent; day: LocalDate }[] = [];
    for (const c of xs) {
      if (c.a === c.b) {
        audit.zero_delta++;
        continue;
      }
      const base = {
        id: c.id as EventId,
        household_id: list,
        item_id: c.item,
        command_id: c.id as CommandId,
        occurred_at: c.at,
        actor: null,
        origin: 'backfill' as const
      };
      const event: ItemEvent =
        c.b > c.a ? { ...base, kind: 'purchase', qty: c.b - c.a } : { ...base, kind: 'consume', qty: c.a - c.b, after: c.b };
      out.push({ event, day: c.day });
      if (event.kind === 'purchase') {
        const days = purchaseDays.get(c.item) ?? [];
        if (days.at(-1) !== c.day) days.push(c.day);
        purchaseDays.set(c.item, days);
      }
    }
    events.set(list, out);
  }
  const items = [...names].filter(([id]) => live(id)).map(([id, { list, name }]) => blankItem(id, list, name));
  return { items, changes, events, purchaseDays, audit, rows: rows.length };
}

/**
 * The legacy client compared against a list that refetched only after a debounce, so quick taps
 * logged `4 → 3`, `4 → 1`, `4 → 2` for one walk from 4 to 2. Collapses such runs into one change.
 */
function collapse(xs: Change[]): Change[] {
  const lastOf = new Map<ItemId, number>();
  const out: Change[] = [];
  for (const c of xs) {
    const i = lastOf.get(c.item);
    const prev = i === undefined ? undefined : out[i]!;
    if (prev && prev.a === c.a && prev.b !== c.a && Date.parse(c.at) - Date.parse(prev.at) < 60_000) {
      out[i!] = { ...prev, b: c.b, at: c.at, day: c.day };
      continue;
    }
    lastOf.set(c.item, out.length);
    out.push(c);
  }
  return out;
}

function walkDays(n: number): LocalDate[] {
  const days: LocalDate[] = [];
  for (let d = WALK_START; daysBetween(d, WALK_END) >= n - 1; d = addDays(d, 7)) days.push(d);
  return days;
}

/** Stock is unknown, so each item's amount is the `b` of its last parsed row before the day. */
function contexts(data: Dataset, days: readonly LocalDate[]): DayContext[] {
  const out: DayContext[] = [];
  for (const day of days) {
    for (const [list, changes] of data.changes) {
      const amount = new Map<ItemId, number>();
      for (const c of changes) if (c.day < day) amount.set(c.item, c.b);
      const events = (data.events.get(list) ?? []).filter((e) => e.day < day).map((e) => e.event);
      const items = data.items
        .filter((i) => i.household_id === list)
        .map((i) => ({ ...i, amount: Math.max(0, amount.get(i.id) ?? 0) }));
      out.push({ day, list, items, events });
    }
  }
  return out;
}

function pick(ctxs: readonly DayContext[], choose: (ctx: DayContext) => Iterable<ItemId>): Picks {
  const picks: Picks = new Map();
  for (const ctx of ctxs) {
    const set = picks.get(ctx.day) ?? new Set<ItemId>();
    for (const id of choose(ctx)) set.add(id);
    picks.set(ctx.day, set);
  }
  return picks;
}

const byRules = (rules: SuggestRules) => (ctx: DayContext) =>
  suggest({ items: ctx.items, bag: [], events: ctx.events, today: ctx.day, rules, historyComplete: true }).probablyNeed.map(
    (s) => s.item.id
  );

interface Score {
  weeks: number;
  suggestions: number;
  hits: number;
  purchases: number;
  caught: number;
  precision: number;
  recall: number;
  f1: number;
  perWeek: number;
  /** Per walk day at this horizon: [suggestions, hits, purchases, caught], for the bootstrap. */
  weekly: [number, number, number, number][];
  falsePositives: { day: LocalDate; item: ItemId }[];
  misses: { day: LocalDate; item: ItemId; bought: LocalDate }[];
}

const f1Of = (p: number, r: number) => (p + r > 0 ? (2 * p * r) / (p + r) : 0);

function boughtWithin(data: Dataset, item: ItemId, day: LocalDate, n: number) {
  return (data.purchaseDays.get(item) ?? []).some((p) => p >= day && daysBetween(day, p) < n);
}

/**
 * Precision: suggestions on day d bought in [d, d+n). Recall: purchase days that fall in [d, d+n)
 * of some walk day d, caught when the item was suggested on such a d. Each purchase counts once,
 * against its latest walk day, which keeps the weekly counts disjoint at n = 7.
 */
function score(data: Dataset, picks: Picks, n: number, days: readonly LocalDate[] = walkDays(n)): Score {
  const weekly: Score['weekly'] = days.map(() => [0, 0, 0, 0]);
  const falsePositives: Score['falsePositives'] = [];
  const misses: Score['misses'] = [];
  days.forEach((day, w) => {
    for (const item of picks.get(day) ?? []) {
      weekly[w]![0]++;
      if (boughtWithin(data, item, day, n)) weekly[w]![1]++;
      else falsePositives.push({ day, item });
    }
  });
  for (const [item, bought] of data.purchaseDays) {
    for (const p of bought) {
      const w = days.findLastIndex((d) => d <= p && daysBetween(d, p) < n);
      if (w < 0) continue;
      weekly[w]![2]++;
      const caught = days.some((d) => d <= p && daysBetween(d, p) < n && picks.get(d)?.has(item));
      if (caught) weekly[w]![3]++;
      else misses.push({ day: days[w]!, item, bought: p });
    }
  }
  const [suggestions, hits, purchases, caught] = weekly.reduce(
    (acc, row) => acc.map((v, i) => v + row[i]!) as [number, number, number, number],
    [0, 0, 0, 0]
  );
  const precision = suggestions ? hits / suggestions : NaN;
  const recall = purchases ? caught / purchases : NaN;
  return {
    weeks: days.length,
    suggestions,
    hits,
    purchases,
    caught,
    precision,
    recall,
    f1: f1Of(precision || 0, recall || 0),
    perWeek: suggestions / days.length,
    weekly,
    falsePositives,
    misses
  };
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 95% interval of F1(b) − F1(a), resampling walk weeks with replacement (paired). */
function bootstrapF1Delta(a: Score, b: Score, resamples = 2000) {
  const rand = mulberry32(42);
  const weeks = a.weekly.length;
  const f1 = (rows: Score['weekly'], idx: number[]) => {
    let s = 0, h = 0, p = 0, c = 0;
    for (const i of idx) {
      s += rows[i]![0];
      h += rows[i]![1];
      p += rows[i]![2];
      c += rows[i]![3];
    }
    return f1Of(s ? h / s : 0, p ? c / p : 0);
  };
  const deltas: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const idx = Array.from({ length: weeks }, () => Math.floor(rand() * weeks));
    deltas.push(f1(b.weekly, idx) - f1(a.weekly, idx));
  }
  deltas.sort((x, y) => x - y);
  return [deltas[Math.floor(0.025 * resamples)]!, deltas[Math.floor(0.975 * resamples)]!] as const;
}

const pct = (x: number) => (Number.isNaN(x) ? '   n/a' : `${(100 * x).toFixed(1).padStart(5)}%`);
const rulesLabel = (r: SuggestRules) => `dueFraction ${r.dueFraction}, minPurchaseDays ${r.minPurchaseDays}, windowDays ${r.windowDays}`;
const scoreLine = (s: Score) =>
  `precision ${pct(s.precision)}  recall ${pct(s.recall)}  F1 ${s.f1.toFixed(3)}  ${s.perWeek.toFixed(1).padStart(5)}/week  (${s.hits}/${s.suggestions} suggestions, ${s.caught}/${s.purchases} purchases, ${s.weeks} weeks)`;

function topNames(data: Dataset, ids: readonly ItemId[], k = 8) {
  const names = new Map(data.items.map((i) => [i.id, i.name]));
  const counts = new Map<ItemId, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || names.get(a[0])!.localeCompare(names.get(b[0])!))
    .slice(0, k)
    .map(([id, n]) => `${names.get(id)} (${n})`)
    .join(', ');
}

function tally<K>(keys: Iterable<K>) {
  const m = new Map<K, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

function purchaseDaysBefore(data: Dataset, item: ItemId, day: LocalDate, windowDays: number) {
  return (data.purchaseDays.get(item) ?? []).filter((p) => p < day && daysBetween(p, day) < windowDays).length;
}

function missReasons(data: Dataset, ctxs: readonly DayContext[], rules: SuggestRules, misses: Score['misses']) {
  const byDay = new Map<string, DayContext>();
  for (const c of ctxs) byDay.set(`${c.day}|${c.list}`, c);
  const listOf = new Map(data.items.map((i) => [i.id, i.household_id]));
  return tally(
    misses.map(({ day, item }) => {
      const days = purchaseDaysBefore(data, item, day, rules.windowDays);
      if (days === 0) return 'no purchase in the window yet';
      if (days < rules.minPurchaseDays) return `fewer than ${rules.minPurchaseDays} purchase days`;
      const ctx = byDay.get(`${day}|${listOf.get(item)}`)!;
      const empty = ctx.items.map((i) => (i.id === item ? { ...i, amount: 0 } : i));
      return byRules(rules)({ ...ctx, items: empty }).includes(item)
        ? 'due, but stock covers a typical purchase'
        : 'cadence not due yet';
    })
  );
}

function falsePositiveReasons(data: Dataset, n: number, fps: Score['falsePositives']) {
  return tally(
    fps.map(({ day, item }) => {
      const next = (data.purchaseDays.get(item) ?? []).find((p) => p >= day);
      if (!next) return 'never bought again';
      const wait = daysBetween(day, next);
      return wait < 2 * n ? `bought ${n}-${2 * n - 1} days later` : `bought ${2 * n}+ days later`;
    })
  );
}

function printTally(m: Map<string, number>) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) console.log(`    ${pct(v / total)}  ${v}  ${k}`);
}

function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: npx tsx scripts/calibrate-suggestions.ts <path-to-logs-export.json>');
  const rows = readRows(path);
  const data = parse(rows);
  const events = [...data.events.values()].flat();
  const purchases = events.filter((e) => e.event.kind === 'purchase').length;
  const auditTotal = Object.values(data.audit).reduce((a, b) => a + b, 0);
  if (events.length + auditTotal !== rows.length) throw new Error('Conservation failed: rows != events + audit');

  console.log(`# Suggestion calibration (TZ ${process.env.TZ})\n`);
  console.log(`Parse, migration step 4: ${rows.length} rows = ${events.length} events + ${auditTotal} audit`);
  console.log(`  events: ${purchases} purchase, ${events.length - purchases} consume`);
  console.log(
    `  audit: other_action ${data.audit.other_action}, unparseable ${data.audit.unparseable}, unmatched (item deleted) ${data.audit.unmatched}, zero_delta ${data.audit.zero_delta}`
  );
  const payloadShapes = tally(
    rows.filter((r) => STOCK_ACTIONS.has(r.action) && !PAYLOAD.test(r.payload ?? '')).map((r) => JSON.stringify((r.payload ?? '').replace(/\d+(\.\d+)?/g, 'N')))
  );
  console.log(`  unparseable payload shapes: ${[...payloadShapes].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const perList = tally(data.items.map((i) => i.household_id.slice(0, 8)));
  console.log(`  items per list: ${[...perList].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const spellings = new Map<ItemId, Set<string>>();
  for (const r of rows) spellings.set(keyOf(r.list_id, r.item), (spellings.get(keyOf(r.list_id, r.item)) ?? new Set()).add(r.item));
  console.log(`  names that normName folds from 2+ spellings: ${[...spellings.values()].filter((s) => s.size > 1).length}`);

  console.log('\nAre shopping-list edits in the stock rows?');
  const byItem = new Map<ItemId, LegacyRow[]>();
  for (const r of [...rows].sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at))) {
    const k = keyOf(r.list_id, r.item);
    byItem.set(k, [...(byItem.get(k) ?? []), r]);
  }
  const nextKind = (xs: LegacyRow[], i: number) => {
    const n = xs.slice(i + 1).find((x) => STOCK_ACTIONS.has(x.action) && PAYLOAD.test(x.payload ?? ''));
    if (!n || Date.parse(n.created_at) - Date.parse(xs[i]!.created_at) > 14 * 86_400_000) return 'none';
    const m = PAYLOAD.exec(n.payload!)!;
    return +m[4]! > +m[1]! ? 'increase' : 'other';
  };
  const afterEmpty = tally([...byItem.values()].flatMap((xs) => xs.flatMap((r, i) => (r.action === 'updated' && !r.payload ? [nextKind(xs, i)] : []))));
  const afterStock = tally([...byItem.values()].flatMap((xs) => xs.flatMap((r, i) => (PAYLOAD.test(r.payload ?? '') ? [nextKind(xs, i)] : []))));
  const share = (m: Map<string, number>) => (m.get('increase') ?? 0) / [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`  next stock row within 14 days is an increase: after an empty-payload update ${pct(share(afterEmpty))}, after a stock row ${pct(share(afterStock))}`);
  let chained = 0, overlaps = 0, otherBreaks = 0;
  for (const xs of data.changes.values()) {
    const prev = new Map<ItemId, Change>();
    for (const c of xs) {
      const p = prev.get(c.item);
      if (p) {
        if (c.a === p.b) chained++;
        else if (c.a === p.a && Date.parse(c.at) - Date.parse(p.at) < 60_000) overlaps++;
        else otherBreaks++;
      }
      prev.set(c.item, c);
    }
  }
  console.log(`  consecutive stock rows per item: ${chained} chain (a = previous b), ${overlaps} debounce overlaps (same a within 60 s), ${otherBreaks} other breaks`);

  console.log('\nShopping rhythm');
  const allPurchaseDays = [...data.purchaseDays.values()].flat();
  const weekday = tally(allPurchaseDays.map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })));
  console.log(`  item purchase days by weekday: ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `${d} ${weekday.get(d) ?? 0}`).join(', ')}`);
  const gaps = [...data.purchaseDays.values()].flatMap((ds) => ds.slice(1).map((d, i) => daysBetween(ds[i]!, d)));
  const weekly = gaps.filter((g) => g % 7 === 0).length;
  const nearWeekly = gaps.filter((g) => [0, 1, 6].includes(g % 7)).length;
  console.log(`  gaps between an item's purchase days: ${gaps.length}, ${pct(weekly / gaps.length)} whole weeks, ${pct(nearWeekly / gaps.length)} within a day of whole weeks, median ${[...gaps].sort((a, b) => a - b)[gaps.length >> 1]} days`);
  const cvs = [...data.purchaseDays.values()]
    .map((ds) => ds.slice(1).map((d, i) => daysBetween(ds[i]!, d)))
    .filter((g) => g.length >= 3)
    .map((g) => {
      const mean = g.reduce((a, b) => a + b, 0) / g.length;
      return Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length) / mean;
    })
    .sort((a, b) => a - b);
  console.log(`  items with 3+ gaps: ${cvs.length}, median coefficient of variation of their gaps ${cvs[cvs.length >> 1]!.toFixed(2)}`);

  const allDays = walkDays(1);
  console.log(`\nWalk: ${allDays.length} Saturdays from ${allDays[0]} to ${allDays.at(-1)}; at horizon N a day counts only if [d, d+N) ends by ${WALK_END}`);
  const ctxs = contexts(data, allDays);

  const settings: SuggestRules[] = SWEEP.dueFraction.flatMap((dueFraction) =>
    SWEEP.minPurchaseDays.flatMap((minPurchaseDays) =>
      SWEEP.windowDays.map((windowDays) => ({ ...DEFAULT_RULES, dueFraction, minPurchaseDays, windowDays }))
    )
  );
  const sweep = settings.map((rules) => ({ rules, picks: pick(ctxs, byRules(rules)) }));
  const scored = sweep.map((s) => ({ ...s, score: score(data, s.picks, MAIN_N) }));
  const current = scored.find((s) => rulesLabel(s.rules) === rulesLabel(DEFAULT_RULES))!;

  console.log(`\nSweep at N = ${MAIN_N}, by F1`);
  for (const s of [...scored].sort((a, b) => b.score.f1 - a.score.f1)) {
    const mark = s === current ? ' <- current' : '';
    console.log(`  df ${s.rules.dueFraction.toFixed(1)} mpd ${s.rules.minPurchaseDays} win ${String(s.rules.windowDays).padStart(3)}  ${scoreLine(s.score)}${mark}`);
  }

  // Decided before the first run: maximize F1 at N = 7, and move off the current rules only when
  // the paired bootstrap interval of the F1 gain excludes zero.
  const best = [...scored].sort((a, b) => b.score.f1 - a.score.f1 || b.score.precision - a.score.precision)[0]!;
  const [lo, hi] = bootstrapF1Delta(current.score, best.score);
  const adopt = best !== current && lo > 0;
  const chosen = adopt ? best : current;
  const tied = scored.filter((s) => s === best || bootstrapF1Delta(s.score, best.score)[0] <= 0);
  console.log(`\nBest F1: ${rulesLabel(best.rules)}`);
  console.log(`  F1 best − current = ${(best.score.f1 - current.score.f1).toFixed(3)}, paired bootstrap over weeks 95% CI [${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
  console.log(`  Decision: ${adopt ? 'adopt the best setting' : 'keep the current setting (no measurable gain)'}`);
  console.log(`  Recommended DEFAULT_RULES: ${rulesLabel(chosen.rules)}`);
  console.log(`  ${tied.length} of ${scored.length} settings are within noise of the best F1 (their CI of the gap includes 0)`);
  const frontier = scored
    .filter((s) => !scored.some((o) => o.score.precision >= s.score.precision && o.score.recall >= s.score.recall && (o.score.precision > s.score.precision || o.score.recall > s.score.recall)))
    .sort((a, b) => b.score.recall - a.score.recall);
  console.log('  Precision/recall frontier (no other setting beats it on both):');
  for (const s of frontier) console.log(`    df ${s.rules.dueFraction.toFixed(1)} mpd ${s.rules.minPurchaseDays} win ${String(s.rules.windowDays).padStart(3)}  ${scoreLine(s.score)}`);

  console.log('\nCurrent vs recommended by horizon');
  for (const n of HORIZONS) {
    console.log(`  N = ${String(n).padStart(2)} current      ${scoreLine(score(data, current.picks, n))}`);
    console.log(`  N = ${String(n).padStart(2)} recommended  ${scoreLine(score(data, chosen.picks, n))}`);
  }

  const days = walkDays(MAIN_N);
  const halves = [days.slice(0, days.length >> 1), days.slice(days.length >> 1)];
  console.log(`\nStability across halves of the walk (N = ${MAIN_N}): was the choice fit to one stretch?`);
  for (const half of halves) {
    console.log(`  ${half[0]} .. ${half.at(-1)}`);
    for (const [label, s] of [['current', current], ['recommended', chosen]] as const) {
      console.log(`    ${label.padEnd(11)} ${scoreLine(score(data, s.picks, MAIN_N, half))}`);
    }
  }

  console.log(`\nBaselines at N = ${MAIN_N} (the metric should rank these below the rules)`);
  const everything = pick(ctxs, (ctx) => ctx.items.filter((i) => (data.purchaseDays.get(i.id) ?? []).some((p) => p < ctx.day)).map((i) => i.id));
  const lastWeek = pick(ctxs, (ctx) => ctx.items.filter((i) => (data.purchaseDays.get(i.id) ?? []).some((p) => p < ctx.day && daysBetween(p, ctx.day) <= 7)).map((i) => i.id));
  const nothing = pick(ctxs, () => []);
  console.log(`  everything bought before  ${scoreLine(score(data, everything, MAIN_N))}`);
  console.log(`  bought in the last 7 days ${scoreLine(score(data, lastWeek, MAIN_N))}`);
  console.log(`  nothing                   ${scoreLine(score(data, nothing, MAIN_N))}`);
  const chosenScore = score(data, chosen.picks, MAIN_N);
  const everythingScore = score(data, everything, MAIN_N);
  console.log(`  a random pick of the recommended size scores the base rate: precision ${pct(everythingScore.precision)}; the recommended rules lift it ${(chosenScore.precision / everythingScore.precision).toFixed(1)}x`);

  console.log(`\nWhat limits the recommended rules at N = ${MAIN_N}`);
  console.log(`  missed purchases (${chosenScore.misses.length}), by reason on the walk day before:`);
  printTally(missReasons(data, ctxs, chosen.rules, chosenScore.misses));
  console.log(`  false positives (${chosenScore.falsePositives.length}), by when the item was bought next:`);
  printTally(falsePositiveReasons(data, MAIN_N, chosenScore.falsePositives));
  console.log(`  top false positives: ${topNames(data, chosenScore.falsePositives.map((f) => f.item))}`);
  console.log(`  top missed items: ${topNames(data, chosenScore.misses.map((m) => m.item))}`);
  const caughtNames = topNames(
    data,
    [...chosen.picks].flatMap(([day, ids]) => [...ids].filter((id) => boughtWithin(data, id, day, MAIN_N)))
  );
  console.log(`  top correct suggestions: ${caughtNames}`);
  const withCadence = pick(ctxs, (ctx) =>
    ctx.items.filter((i) => purchaseDaysBefore(data, i.id, ctx.day, chosen.rules.windowDays) >= chosen.rules.minPurchaseDays).map((i) => i.id)
  );
  console.log(`  every item with a cadence, every week: ${scoreLine(score(data, withCadence, MAIN_N))}`);
  for (const [label, s] of [['current', current], ['recommended', chosen]] as const) {
    let fresh = 0, freshHits = 0;
    for (const [day, ids] of s.picks) {
      for (const id of ids) {
        if (s.picks.get(addDays(day, -7))?.has(id)) continue;
        fresh++;
        if (boughtWithin(data, id, day, MAIN_N)) freshHits++;
      }
    }
    console.log(`  ${label} rules, suggestions new that week (not shown the week before): ${fresh}, precision ${pct(freshHits / fresh)}`);
  }

  console.log(`\nVariants of the input (N = ${MAIN_N})`);
  const variants = [
    ['debounce overlaps collapsed', parse(rows, { collapseOverlaps: true })],
    ['deleted items kept', parse(rows, { keepDeleted: true })]
  ] as const;
  for (const [label, rules] of [['current', current.rules], ['recommended', chosen.rules]] as const) {
    console.log(`  ${label}`);
    console.log(`    as migrated                 ${scoreLine(score(data, pick(ctxs, byRules(rules)), MAIN_N))}`);
    for (const [name, variant] of variants) {
      console.log(`    ${name.padEnd(27)} ${scoreLine(score(variant, pick(contexts(variant, allDays), byRules(rules)), MAIN_N))}`);
    }
  }

  console.log(`\nWalk weekday sensitivity, recommended rules, N = ${MAIN_N}`);
  for (let shift = 0; shift < 7; shift++) {
    const shiftedDays = walkDays(MAIN_N).map((d) => addDays(d, shift)).filter((d) => daysBetween(d, WALK_END) >= MAIN_N - 1);
    const picks = pick(contexts(data, shiftedDays), byRules(chosen.rules));
    const s = score(data, picks, MAIN_N, shiftedDays);
    const name = new Date(`${shiftedDays[0]}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' });
    console.log(`  ${name}  precision ${pct(s.precision)}  recall ${pct(s.recall)}  ${s.perWeek.toFixed(1)}/week`);
  }
}

main();
