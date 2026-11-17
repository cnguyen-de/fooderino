declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ItemId = Brand<string, 'ItemId'>;
export type HouseholdId = Brand<string, 'HouseholdId'>;
export type BagId = Brand<string, 'BagId'>;
export type CommandId = Brand<string, 'CommandId'>;
export type EventId = Brand<string, 'EventId'>;
/** A calendar day, `YYYY-MM-DD`, with no time zone. */
export type LocalDate = Brand<string, 'LocalDate'>;
/** A point in time, ISO-8601 in UTC. */
export type Instant = Brand<string, 'Instant'>;

export type TagKind = 'place' | 'store' | 'other';
export interface Tag {
  kind: TagKind;
  name: string;
}
export type Unit = 'count' | 'gram';

/** Record-level LWW fields, pushed by the client. */
export interface ItemMetadata {
  name: string;
  aliases: string[];
  tags: Tag[];
  unit: Unit;
  default_amount: number;
  shelf_life_days: number | null;
}

/** Server-owned counters. Only commands change them. */
export interface Stock {
  amount: number;
  to_buy: number;
  best_before: LocalDate | null;
}

/** A live item as the UI reads it. */
export interface PantryItem extends ItemMetadata, Stock {
  id: ItemId;
}

export interface Item extends PantryItem {
  household_id: HouseholdId;
  merged_into: ItemId | null;
  deleted_at: Instant | null;
}

export interface ItemRow extends Item {
  updated_at: Instant;
  seq: number;
}

export const SERVER_OWNED_ITEM_FIELDS = [
  'amount',
  'to_buy',
  'best_before',
  'merged_into'
] as const satisfies readonly (keyof Item)[];

interface BagEntryBase {
  id: BagId;
  household_id: HouseholdId;
  item_id: ItemId;
  qty: number;
  /** The part of `qty` that was taken off `to_buy`, given back on cancel. */
  from_list: number;
  bought_at: Instant;
  /** The purchase event a cancel reverses. */
  purchase_event: EventId;
}

export type BagEntry = BagEntryBase &
  ({ state: 'open'; closed_by_command: null } | { state: 'unpacked' | 'cancelled'; closed_by_command: CommandId });

export type BagEntryRow = BagEntry & { seq: number };

export type EventOrigin = 'live' | 'backfill' | 'import';

interface EventBase {
  id: EventId;
  household_id: HouseholdId;
  item_id: ItemId;
  command_id: CommandId;
  occurred_at: Instant;
  actor: string | null;
  origin: EventOrigin;
}

export type ItemEvent = EventBase &
  (
    | { kind: 'purchase'; qty: number }
    | { kind: 'consume' | 'waste'; qty: number; after: number }
    | { kind: 'correction'; before: Stock; after: Stock; reverses: EventId | null }
    | { kind: 'dismiss' }
  );

export type ItemEventRow = ItemEvent & { seq: number };

export interface HouseholdRow {
  id: HouseholdId;
  legacy_id: number | null;
  name: string;
  seq: number;
  updated_at: Instant;
  deleted_at: Instant | null;
}

export interface MemberRow {
  id: string;
  household_id: HouseholdId;
  user_id: string | null;
  email: string;
  name: string | null;
  avatar: string | null;
  role: 'admin' | 'member';
  seq: number;
  updated_at: Instant;
  deleted_at: Instant | null;
}

interface CommandBase {
  /** Minted once per gesture and reused on retry. */
  id: CommandId;
  household_id: HouseholdId;
  item_id: ItemId;
  /** Client gesture time. */
  at: Instant;
}

export type Command = CommandBase &
  (
    | { kind: 'create'; item: ItemMetadata; start: Partial<Stock> }
    | { kind: 'use'; qty: number; waste: boolean }
    /** `qty` is the absolute target for `to_buy`. */
    | { kind: 'want'; qty: number }
    | { kind: 'tick'; bag_id: BagId; qty: number; from_list: number }
    | { kind: 'cancel_bag'; bag_id: BagId }
    | { kind: 'unpack'; bag_id: BagId; best_before?: LocalDate; place?: string }
    /** Absolute values. An absent field is untouched; `best_before: null` clears it. */
    | { kind: 'set'; amount?: number; best_before?: LocalDate | null }
    | { kind: 'undo'; target: CommandId }
    | { kind: 'dismiss' }
    | { kind: 'merge'; into: ItemId }
  );

export type CommandKind = Command['kind'];

export type RejectionReason = 'insufficient_stock' | 'bag_closed' | 'cannot_undo' | 'not_found' | 'invalid';

export interface Rejection {
  command: CommandId;
  reason: RejectionReason;
}

/** What an accepted command recorded so that `undo` can apply its exact inverse. */
export type Inverse =
  | { kind: 'restock'; item_id: ItemId; qty: number; reverses: EventId }
  | { kind: 'restore_to_buy'; item_id: ItemId; to_buy: number }
  | {
      kind: 'restore_stock';
      item_id: ItemId;
      before: Partial<Pick<Stock, 'amount' | 'best_before'>>;
      reverses: EventId;
    }
  | { kind: 'cancel_bag'; bag_id: BagId }
  | { kind: 'repack'; bag_id: BagId; best_before: LocalDate | null };

export interface Snapshot {
  items: ReadonlyMap<ItemId, Item>;
  bag: ReadonlyMap<BagId, BagEntry>;
  /** Accepted commands. A null inverse means the command cannot be undone, or already was. */
  log: ReadonlyMap<CommandId, Inverse | null>;
}

export interface UseSoonEntry {
  item: PantryItem;
  best_before: LocalDate;
  /** Negative when overdue. */
  days_left: number;
}

export interface BuyEntry {
  item: PantryItem;
  qty: number;
}

/** A place group on Home or a store group on Shopping. `name: null` is the Unsorted group. */
export interface ItemGroup {
  name: string | null;
  items: PantryItem[];
}

export interface BagLine {
  id: BagId;
  item: PantryItem;
  qty: number;
  from_list: number;
  bought_at: Instant;
}

export interface PantryView {
  home: { useSoon: UseSoonEntry[]; mostUsed: PantryItem[]; byPlace: ItemGroup[] };
  shopping: { byStore: ItemGroup[]; probablyNeed: BuyEntry[]; ranOut: PantryItem[]; bag: BagLine[] };
  byId(id: ItemId): PantryItem | undefined;
  history(id: ItemId): ItemEvent[];
}
