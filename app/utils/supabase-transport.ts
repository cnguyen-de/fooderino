import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row, SyncTransport } from '~~/utils/sync-engine';
import type { PendingOp } from '~~/types/sync';

export function createSupabaseTransport(client: SupabaseClient): SyncTransport {
  return {
    async fetchSince(table, cursorField, since, offset, limit) {
      let q = client
        .from(table)
        .select('*')
        .order(cursorField, { ascending: true })
        .range(offset, offset + limit - 1);
      if (since) q = q.gt(cursorField, since);

      const { data, error } = await q;
      if (error) throw new Error(`pull ${table}: ${error.message}`);
      return (data ?? []) as Row[];
    },

    async upsertRows(table, rows) {
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`push ${table}: ${error.message}`);
    },

    async insertOp(op: PendingOp) {
      const { error } = await client.from('item_ops').insert({
        id: op.id,
        item_id: op.item_id,
        list_id: op.list_id,
        field: op.field,
        kind: op.kind,
        value: op.value,
        actor: op.actor
      });
      // 23505 = unique_violation: this op id already landed, so the server
      // has already folded it. Reporting success lets the caller dequeue.
      if (error && error.code === '23505') return 'duplicate';
      if (error) throw new Error(`push op: ${error.message}`);
      return 'inserted';
    }
  };
}
