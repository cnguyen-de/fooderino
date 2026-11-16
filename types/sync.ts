/** Every LWW-synced record carries these three fields. */
export interface SyncRecord {
  id: string;
  updated_at: string;
  deleted_at: string | null;
}

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

/** Append-only: no updated_at, no deleted_at, never merged. */
export interface LogRecord {
  id: string;
  list_id: string;
  actor_email: string | null;
  item_name: string | null;
  action: string | null;
  payload: string | null;
  created_at: string;
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

export type OpField = 'amount' | 'amount_to_purchase';
export type OpKind = 'delta' | 'set';

/** A counter mutation awaiting push. Local-only; never pulled. */
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

/** Local-only singleton. `cursors` is keyed by the registry's `local` name. */
export interface SyncStateRow {
  key: string;
  device_id: string;
  user_id: string | null;
  hydrated_at: string | null;
  cursors: Record<string, { pulled: string | null; pushed: string | null }>;
}
