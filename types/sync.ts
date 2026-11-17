import type {
  BagEntryRow,
  Command,
  CommandId,
  CommandKind,
  CommandLogRow,
  HouseholdId,
  HouseholdRow,
  Instant,
  ItemEventRow,
  ItemId,
  ItemRow,
  ItemSheet,
  MemberRow,
  RejectionReason
} from '~~/types/pantry';

/** Every LWW-synced record carries these three fields. */
export interface SyncRecord {
  id: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RecipeIngredient {
  name: string;
  amount?: number;
  amount_type: 'count' | 'gram';
}

export interface RecipeRecord extends SyncRecord {
  user_id: string;
  name: string;
  description: string | null;
  ingredients: RecipeIngredient[];
  instructions: string | null;
  saved: boolean;
}

/** A pulled recipe and its server-stamped pull position. */
export type PulledRecipe = RecipeRecord & { synced_at: string };

/** The recipes pull position: `synced_at` as the server wrote it (microseconds kept), then `id`. */
export interface RecipeCursor {
  synced_at: string;
  id: string;
}

/** A command waiting in the outbox. The drain sends commands in `created_seq` order. */
export type QueuedCommand = Command & { created_seq: number };

/** A metadata write waiting to be pushed: the whole LWW sheet, stamped when the user saved it. */
export type PendingEdit = ItemSheet & { updated_at: Instant };

/** The Dexie stores that hold confirmed household state, each pulled from one server table. */
export interface HouseholdRows {
  households: HouseholdRow;
  members: MemberRow;
  items: ItemRow;
  bag: BagEntryRow;
  events: ItemEventRow;
  log: CommandLogRow;
}
export type HouseholdStore = keyof HouseholdRows;

/** Local-only singleton. */
export interface SyncStateRow {
  key: string;
  device_id: string;
  user_id: string | null;
  /** The household this device holds data for, or null when it holds none. */
  household_id: HouseholdId | null;
  /** Set when a full pull of the current household has finished, so history is complete. */
  hydrated_at: Instant | null;
  /** The highest server `seq` pulled, per household store. */
  cursors: Partial<Record<HouseholdStore, number>>;
  recipes: { pulled: RecipeCursor | null; pushed: string | null };
}

/** A command the server, or the local precheck, refused. The UI shows it as a toast. */
export interface RejectionNotice {
  command: CommandId;
  kind: CommandKind;
  item_id: ItemId;
  /** The item's name when the device knows it, for "Someone already used the last Milk". */
  item_name: string | null;
  reason: RejectionReason;
}

// List-era rows (Dexie v1 and v2). Only the v3 upgrade and the dead list-era UI still read them.

export interface ListRecord extends SyncRecord {
  name: string;
  owner: string;
}

export interface ListMemberRecord extends SyncRecord {
  list_id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  avatar: string | null;
  role: 'admin' | 'member';
}

export interface ItemRecord extends SyncRecord {
  list_id: string;
  name: string;
  location: string;
  store: string;
  amount: number;
  amount_to_purchase: number;
  amount_type: string;
  default_amount: number;
  created_by: string | null;
}

export interface LogRecord {
  id: string;
  list_id: string;
  actor_email: string | null;
  item_name: string | null;
  action: string | null;
  payload: string | null;
  created_at: string;
}

export type OpField = 'amount' | 'amount_to_purchase';
export type OpKind = 'delta' | 'set';

export interface PendingOp {
  id: string;
  item_id: string;
  list_id: string;
  field: OpField;
  kind: OpKind;
  value: number;
  actor: string | null;
  created_at: string;
}
