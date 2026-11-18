import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { HouseholdId } from '~~/types/pantry';
import type { RecipeRecord } from '~~/types/sync';
import { TransportRefused, type SyncTransport } from '~~/utils/sync-engine';
import { parseApplyResponse, parseRecipe } from '~~/utils/sync-wire';

/** Statuses where PostgREST judged the request itself invalid: RLS, a constraint, a malformed value. */
const REFUSED_STATUS = new Set([400, 403, 409, 422]);

function fail(context: string, error: PostgrestError, status: number): never {
  const message = `${context}: ${error.message}`;
  throw REFUSED_STATUS.has(status) ? new TransportRefused(message) : new Error(message);
}

function recipeRow(r: RecipeRecord) {
  const { id, user_id, name, description, ingredients, instructions, saved, updated_at, deleted_at } = r;
  return { id, user_id, name, description, ingredients, instructions, saved, updated_at, deleted_at };
}

// The SDK can wait for an auth lock before reaching fetch. Bound that wait too,
// and abort the underlying request so a late token cannot send a stale write.
async function request<T>(query: { abortSignal(signal: AbortSignal): PromiseLike<T> }): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Sync request timed out'));
    }, 30_000);
  });
  try {
    return await Promise.race([query.abortSignal(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function createSupabaseTransport(client: SupabaseClient): SyncTransport {
  return {
    async applyCommands(batch) {
      const { data, error, status } = await request(client.rpc('apply_commands', { commands: batch }));
      // Even a refused batch stays queued: apply_commands turns bad commands into rejections,
      // so an error here is about the call, not about any one command.
      if (error) throw new Error(`apply_commands (${status}): ${error.message}`);
      return parseApplyResponse(data);
    },

    async pull(table, household, afterSeq, limit) {
      const { data, error, status } = await request(
        client
          .from(table.remote)
          .select('*')
          .eq(table.scope, household)
          .gt('seq', afterSeq)
          .order('seq', { ascending: true })
          .limit(limit)
      );
      if (error) fail(`pull ${table.remote}`, error, status);
      return (data ?? []).map(table.parse);
    },

    async pushSheets(table, sheets) {
      // Columns a client is not granted would get the whole upsert refused.
      const rows = sheets.map((sheet) => Object.fromEntries(table.sheet.columns.map((c) => [c, sheet[c]])));
      const { data, error, status } = await request(
        client.from(table.remote).upsert(rows, { onConflict: 'id' }).select('*')
      );
      if (error) fail(`push ${table.remote}`, error, status);
      return (data ?? []).map(table.parse);
    },

    async myHousehold() {
      const { data, error, status } = await request(client.rpc('my_household'));
      if (error) fail('my_household', error, status);
      return data ? (String(data) as HouseholdId) : null;
    },

    async pullRecipes(after, limit) {
      let query = client
        .from('recipes_v2')
        .select('*')
        .order('synced_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);
      if (after) {
        const at = `"${after.synced_at}"`;
        query = query.or(`synced_at.gt.${at},and(synced_at.eq.${at},id.gt.${after.id})`);
      }
      const { data, error, status } = await request(query);
      if (error) fail('pull recipes_v2', error, status);
      return (data ?? []).map(parseRecipe);
    },

    async pushRecipes(rows) {
      const { error, status } = await request(
        client.from('recipes_v2').upsert(rows.map(recipeRow), { onConflict: 'id' })
      );
      if (error) fail('push recipes_v2', error, status);
    }
  };
}
