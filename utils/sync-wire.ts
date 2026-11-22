import type {
  BagEntryRow,
  BagId,
  CommandId,
  CommandKind,
  CommandLogRow,
  EventId,
  EventOrigin,
  HouseholdId,
  HouseholdRow,
  Instant,
  Inverse,
  ItemEventRow,
  ItemId,
  ItemRow,
  LocalDate,
  MemberRow,
  RejectionReason,
  Stock,
  Tag,
  TagKind
} from '~~/types/pantry';
import type {
  CookedId,
  CookedRow,
  Ingredient,
  MealIngredientId,
  MealIngredientRow,
  Quantity,
  RecipeId,
  RecipeRow
} from '~~/types/cook';
import type { Season } from '~~/types/season';
import { isSeason } from '~~/utils/seasons';

/** A server row or response that does not have the shape the client relies on. */
export class WireError extends Error {
  constructor(path: string, expected: string, got: unknown) {
    super(`${path}: expected ${expected}, got ${JSON.stringify(got)}`);
    this.name = 'WireError';
  }
}

type Json = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function obj(v: unknown, path: string): Json {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new WireError(path, 'an object', v);
  return v as Json;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new WireError(path, 'an array', v);
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new WireError(path, 'a string', v);
  return v;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new WireError(path, 'a number', v);
  return v;
}

function uuid<T extends string>(v: unknown, path: string): T {
  if (typeof v !== 'string' || !UUID.test(v)) throw new WireError(path, 'a uuid', v);
  return v.toLowerCase() as T;
}

function instant(v: unknown, path: string): Instant {
  const ms = typeof v === 'string' ? Date.parse(v) : NaN;
  if (Number.isNaN(ms)) throw new WireError(path, 'a timestamp', v);
  return new Date(ms).toISOString() as Instant;
}

function date(v: unknown, path: string): LocalDate {
  if (typeof v !== 'string' || !DATE.test(v)) throw new WireError(path, 'a YYYY-MM-DD date', v);
  return v as LocalDate;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  if (!options.includes(v as T)) throw new WireError(path, options.join(' | '), v);
  return v as T;
}

function nullable<T>(parse: (v: unknown, path: string) => T): (v: unknown, path: string) => T | null {
  return (v, path) => (v === null || v === undefined ? null : parse(v, path));
}

function optUuid<T extends string = string>(v: unknown, path: string): T | null {
  return v === null || v === undefined ? null : uuid<T>(v, path);
}
const optInstant = nullable(instant);
const optDate = nullable(date);
const optStr = nullable(str);
const optNum = nullable(num);

function season(v: unknown, path: string): Season {
  if (!isSeason(v)) throw new WireError(path, 'a season of months 1-12, { from, to }', v);
  return { from: v.from, to: v.to };
}
const optSeason = nullable(season);

const TAG_KINDS: readonly TagKind[] = ['place', 'store', 'other'];
const COMMAND_KINDS: readonly CommandKind[] = [
  'create',
  'use',
  'want',
  'tick',
  'cancel_bag',
  'unpack',
  'set',
  'undo',
  'dismiss',
  'merge'
];
const REASONS: readonly RejectionReason[] = [
  'insufficient_stock',
  'bag_closed',
  'cannot_undo',
  'not_found',
  'invalid',
  'not_member',
  'malformed'
];

function tags(v: unknown, path: string): Tag[] {
  return arr(v, path).map((t, i) => {
    const o = obj(t, `${path}[${i}]`);
    return { kind: oneOf(o.kind, TAG_KINDS, `${path}[${i}].kind`), name: str(o.name, `${path}[${i}].name`) };
  });
}

function stock(v: unknown, path: string): Stock {
  const o = obj(v, path);
  return {
    amount: num(o.amount, `${path}.amount`),
    to_buy: num(o.to_buy, `${path}.to_buy`),
    best_before: optDate(o.best_before, `${path}.best_before`)
  };
}

export function parseHousehold(raw: unknown): HouseholdRow {
  const r = obj(raw, 'household');
  return {
    id: uuid<HouseholdId>(r.id, 'household.id'),
    legacy_id: optNum(r.legacy_id, 'household.legacy_id'),
    name: str(r.name, 'household.name'),
    seq: num(r.seq, 'household.seq'),
    updated_at: instant(r.updated_at, 'household.updated_at'),
    deleted_at: optInstant(r.deleted_at, 'household.deleted_at')
  };
}

export function parseMember(raw: unknown): MemberRow {
  const r = obj(raw, 'member');
  return {
    id: uuid(r.id, 'member.id'),
    household_id: uuid<HouseholdId>(r.household_id, 'member.household_id'),
    user_id: optUuid(r.user_id, 'member.user_id'),
    email: str(r.email, 'member.email'),
    name: optStr(r.name, 'member.name'),
    avatar: optStr(r.avatar, 'member.avatar'),
    role: oneOf(r.role, ['admin', 'member'] as const, 'member.role'),
    seq: num(r.seq, 'member.seq'),
    updated_at: instant(r.updated_at, 'member.updated_at'),
    deleted_at: optInstant(r.deleted_at, 'member.deleted_at')
  };
}

export function parseItem(raw: unknown): ItemRow {
  const r = obj(raw, 'item');
  return {
    id: uuid<ItemId>(r.id, 'item.id'),
    household_id: uuid<HouseholdId>(r.household_id, 'item.household_id'),
    name: str(r.name, 'item.name'),
    aliases: arr(r.aliases, 'item.aliases').map((a, i) => str(a, `item.aliases[${i}]`)),
    tags: tags(r.tags, 'item.tags'),
    unit: oneOf(r.unit, ['count', 'gram'] as const, 'item.unit'),
    default_amount: num(r.default_amount, 'item.default_amount'),
    shelf_life_days: optNum(r.shelf_life_days, 'item.shelf_life_days'),
    season: optSeason(r.season, 'item.season'),
    amount: num(r.amount, 'item.amount'),
    to_buy: num(r.to_buy, 'item.to_buy'),
    best_before: optDate(r.best_before, 'item.best_before'),
    merged_into: optUuid<ItemId>(r.merged_into, 'item.merged_into'),
    deleted_at: optInstant(r.deleted_at, 'item.deleted_at'),
    updated_at: instant(r.updated_at, 'item.updated_at'),
    seq: num(r.seq, 'item.seq')
  };
}

export function parseBagEntry(raw: unknown): BagEntryRow {
  const r = obj(raw, 'bag');
  const base = {
    id: uuid<BagId>(r.id, 'bag.id'),
    household_id: uuid<HouseholdId>(r.household_id, 'bag.household_id'),
    item_id: uuid<ItemId>(r.item_id, 'bag.item_id'),
    qty: num(r.qty, 'bag.qty'),
    from_list: num(r.from_list, 'bag.from_list'),
    bought_at: instant(r.bought_at, 'bag.bought_at'),
    purchase_event: uuid<EventId>(r.purchase_event, 'bag.purchase_event'),
    seq: num(r.seq, 'bag.seq')
  };
  const state = oneOf(r.state, ['open', 'unpacked', 'cancelled'] as const, 'bag.state');
  if (state === 'open') return { ...base, state, closed_by_command: null };
  return { ...base, state, closed_by_command: uuid<CommandId>(r.closed_by_command, 'bag.closed_by_command') };
}

export function parseEvent(raw: unknown): ItemEventRow {
  const r = obj(raw, 'event');
  const base = {
    id: uuid<EventId>(r.id, 'event.id'),
    household_id: uuid<HouseholdId>(r.household_id, 'event.household_id'),
    item_id: uuid<ItemId>(r.item_id, 'event.item_id'),
    command_id: optUuid<CommandId>(r.command_id, 'event.command_id'),
    occurred_at: instant(r.occurred_at, 'event.occurred_at'),
    actor: optStr(r.actor, 'event.actor'),
    origin: oneOf<EventOrigin>(r.origin, ['live', 'backfill', 'import'], 'event.origin'),
    seq: num(r.seq, 'event.seq')
  };
  const kind = oneOf(r.kind, ['purchase', 'consume', 'waste', 'correction', 'dismiss'] as const, 'event.kind');
  switch (kind) {
    case 'purchase':
      return { ...base, kind, qty: num(r.qty, 'event.qty') };
    case 'consume':
    case 'waste':
      return { ...base, kind, qty: num(r.qty, 'event.qty'), after: num(r.after, 'event.after') };
    case 'correction':
      return {
        ...base,
        kind,
        before: stock(r.before, 'event.before'),
        after: stock(r.after, 'event.after'),
        reverses: optUuid<EventId>(r.reverses, 'event.reverses')
      };
    case 'dismiss':
      return { ...base, kind };
  }
}

function inverse(raw: unknown): Inverse {
  const r = obj(raw, 'inverse');
  const kind = oneOf(
    r.kind,
    ['restock', 'restore_to_buy', 'restore_stock', 'cancel_bag', 'repack'] as const,
    'inverse.kind'
  );
  switch (kind) {
    case 'restock':
      return {
        kind,
        item_id: uuid<ItemId>(r.item_id, 'inverse.item_id'),
        qty: num(r.qty, 'inverse.qty'),
        reverses: uuid<EventId>(r.reverses, 'inverse.reverses')
      };
    case 'restore_to_buy':
      return { kind, item_id: uuid<ItemId>(r.item_id, 'inverse.item_id'), to_buy: num(r.to_buy, 'inverse.to_buy') };
    case 'restore_stock': {
      const b = obj(r.before, 'inverse.before');
      const before: { amount?: number; best_before?: LocalDate | null } = {};
      if ('amount' in b) before.amount = num(b.amount, 'inverse.before.amount');
      if ('best_before' in b) before.best_before = optDate(b.best_before, 'inverse.before.best_before');
      return {
        kind,
        item_id: uuid<ItemId>(r.item_id, 'inverse.item_id'),
        before,
        reverses: uuid<EventId>(r.reverses, 'inverse.reverses')
      };
    }
    case 'cancel_bag':
      return { kind, bag_id: uuid<BagId>(r.bag_id, 'inverse.bag_id') };
    case 'repack':
      return {
        kind,
        bag_id: uuid<BagId>(r.bag_id, 'inverse.bag_id'),
        best_before: optDate(r.best_before, 'inverse.best_before')
      };
  }
}

export function parseCommandLog(raw: unknown): CommandLogRow {
  const r = obj(raw, 'command_log');
  return {
    command_id: uuid<CommandId>(r.command_id, 'command_log.command_id'),
    household_id: uuid<HouseholdId>(r.household_id, 'command_log.household_id'),
    kind: oneOf(r.kind, COMMAND_KINDS, 'command_log.kind'),
    actor: uuid(r.actor, 'command_log.actor'),
    item_ids: arr(r.item_ids, 'command_log.item_ids').map((id, i) => uuid<ItemId>(id, `command_log.item_ids[${i}]`)),
    at: instant(r.at, 'command_log.at'),
    inverse: r.inverse === null || r.inverse === undefined ? null : inverse(r.inverse),
    undone_by: optUuid<CommandId>(r.undone_by, 'command_log.undone_by'),
    seq: num(r.seq, 'command_log.seq')
  };
}

function quantity(v: unknown, path: string): Quantity | null {
  if (v === null || v === undefined) return null;
  const o = obj(v, path);
  const amount = num(o.amount, `${path}.amount`);
  if (amount <= 0) throw new WireError(`${path}.amount`, 'a positive number', amount);
  return { amount, unit: oneOf(o.unit, ['count', 'gram'] as const, `${path}.unit`) };
}

function parseIngredient(raw: unknown, path: string): Ingredient {
  const o = obj(raw, path);
  return {
    name: str(o.name, `${path}.name`),
    item_id: optUuid<ItemId>(o.item_id, `${path}.item_id`),
    qty: quantity(o.qty, `${path}.qty`)
  };
}

export function parseRecipe(raw: unknown): RecipeRow {
  const r = obj(raw, 'recipe');
  return {
    id: uuid<RecipeId>(r.id, 'recipe.id'),
    household_id: uuid<HouseholdId>(r.household_id, 'recipe.household_id'),
    name: str(r.name, 'recipe.name'),
    kind: oneOf(r.kind, ['dish', 'soup'] as const, 'recipe.kind'),
    ingredients: arr(r.ingredients, 'recipe.ingredients').map((v, i) => parseIngredient(v, `recipe.ingredients[${i}]`)),
    instructions: str(r.instructions, 'recipe.instructions'),
    deleted_at: optInstant(r.deleted_at, 'recipe.deleted_at'),
    updated_at: instant(r.updated_at, 'recipe.updated_at'),
    seq: num(r.seq, 'recipe.seq')
  };
}

export function parseCooked(raw: unknown): CookedRow {
  const r = obj(raw, 'cooked');
  return {
    id: uuid<CookedId>(r.id, 'cooked.id'),
    household_id: uuid<HouseholdId>(r.household_id, 'cooked.household_id'),
    recipe_id: uuid<RecipeId>(r.recipe_id, 'cooked.recipe_id'),
    date: date(r.date, 'cooked.date'),
    uses: arr(r.uses, 'cooked.uses').map((id, i) => uuid<CommandId>(id, `cooked.uses[${i}]`)),
    deleted_at: optInstant(r.deleted_at, 'cooked.deleted_at'),
    updated_at: instant(r.updated_at, 'cooked.updated_at'),
    seq: num(r.seq, 'cooked.seq')
  };
}

export function parseMealIngredient(raw: unknown): MealIngredientRow {
  const r = obj(raw, 'meal_ingredient');
  return {
    id: uuid<MealIngredientId>(r.id, 'meal_ingredient.id'),
    household_id: uuid<HouseholdId>(r.household_id, 'meal_ingredient.household_id'),
    date: date(r.date, 'meal_ingredient.date'),
    ingredient: parseIngredient(r.ingredient, 'meal_ingredient.ingredient'),
    uses: arr(r.uses, 'meal_ingredient.uses').map((id, i) => uuid<CommandId>(id, `meal_ingredient.uses[${i}]`)),
    deleted_at: optInstant(r.deleted_at, 'meal_ingredient.deleted_at'),
    updated_at: instant(r.updated_at, 'meal_ingredient.updated_at'),
    seq: num(r.seq, 'meal_ingredient.seq')
  };
}

export type CommandResult =
  | { id: CommandId; status: 'accepted' }
  | { id: CommandId; status: 'rejected'; reason: RejectionReason };

/** `apply_commands`' answer: one result per command, in order, and the current rows the batch touched. */
export interface ApplyResponse {
  results: CommandResult[];
  items: ItemRow[];
  bag: BagEntryRow[];
  events: ItemEventRow[];
  log: CommandLogRow[];
}

function result(raw: unknown, i: number): CommandResult {
  const r = obj(raw, `results[${i}]`);
  const status = oneOf(r.status, ['accepted', 'rejected'] as const, `results[${i}].status`);
  // A malformed command echoes whatever id it was sent with, so that id is not a uuid.
  const id = (typeof r.id === 'string' ? r.id : JSON.stringify(r.id)) as CommandId;
  if (status === 'accepted') return { id, status };
  return { id, status, reason: oneOf(r.reason, REASONS, `results[${i}].reason`) };
}

export function parseApplyResponse(raw: unknown): ApplyResponse {
  const r = obj(raw, 'apply_commands');
  return {
    results: arr(r.results, 'results').map(result),
    items: arr(r.items, 'items').map(parseItem),
    bag: arr(r.bag, 'bag').map(parseBagEntry),
    events: arr(r.events, 'events').map(parseEvent),
    log: arr(r.commands, 'commands').map(parseCommandLog)
  };
}
