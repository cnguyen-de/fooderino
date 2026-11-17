import { serverSupabaseServiceRole } from '#supabase/server';
import { readHouseholdStatus, type HouseholdStatus } from '~~/utils/household-move';

export default defineEventHandler(async (event): Promise<HouseholdStatus> => {
  const user = await requireUser(event, 'see your household');
  // Service role: a user choosing between households cannot read them yet.
  const admin = serverSupabaseServiceRole(event) as any;
  return readHouseholdStatus(admin, user).catch((e: unknown) => {
    console.error('[household] status', e);
    throw createError({ statusCode: 500, message: 'Could not load your household.' });
  });
});
