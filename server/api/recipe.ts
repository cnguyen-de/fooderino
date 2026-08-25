import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  const client = await serverSupabaseClient(event);

  // Check if user has AI rights
  if (typeof user === 'undefined' || user === null) {
    return { settings: null };
  }
  let hasAIRight = false;
  const userInfos = await client.from('users').select('ai, free_ai_calls').eq('id', user.id);
  const quota = userInfos.data?.[0] ?? null;
  if (quota && (quota.ai || quota.free_ai_calls > 0)) {
    hasAIRight = true;
  }
  if (!hasAIRight) {
    throw createError({
      status: 401,
      message: 'Your free AI generation has exceeded the limit. Please upgrade your account to generate more recipes.'
    });
  }

  // Gather current user preferences
  const reqQuery = getQuery(event);
  const recipes = await client.from('recipes_v2').select('name').eq('user_id', user.id);
  const userKnownRecipes = recipes.data?.map((recipe) => recipe?.name).join(', ');
  // Preferences moved off `users` and into `user_settings`, which the client
  // syncs. Reading them from `users` here would pin every generation to
  // whatever the values were at the moment of the local-first cutover.
  const prefRows = await client
    .from('user_settings')
    .select('servings, allergies, cuisines')
    .eq('user_id', user.id)
    .is('deleted_at', null);
  const prefs = prefRows.data?.[0] ?? null;
  // `||`, not `??`: these default to empty strings, and an empty string in the
  // prompt reads as a truncated sentence to the model.
  const userAllergies = prefs?.allergies || 'no allergies';
  const userServings = prefs?.servings ?? 1;
  const userFavCuisines = prefs?.cuisines || 'no preferences';
  const useHasIngredients = reqQuery?.useHasIngredients === 'true' || false;
  const userCustomRequest = reqQuery?.request ?? '';
  let userHasIngredients = '';
  if (useHasIngredients) {
    const listId = reqQuery.listId ?? null;
    if (!listId) throw new Error('Missing listId');
    const inventoryItems = await client
      .from('items_v2')
      .select('name')
      .gte('amount', 1)
      .is('deleted_at', null)
      .eq('list_id', listId);
    userHasIngredients = inventoryItems.data?.map((item) => item?.name).join(', ') ?? '';
  }

  // Init LLM AI with user knowledge
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({
    apiKey: apiKey
  });
  const messages = [];
  messages.push({
    role: 'system',
    content: `You are a chef and will be suggesting well known recipes for ${userServings} servings. ${useHasIngredients ? 'Suggest a recipe that only consisted of some of the following ingredients: ' + userHasIngredients : ''}. The user likes ${userFavCuisines} cuisines and do not suggest ingredients in the recipe that are part of user's allergies: ${userAllergies}. Do not suggest a recipe that is too similar to the following recipes: ${userKnownRecipes} ${userCustomRequest ? '. Take the user\'s request into account: "' + userCustomRequest + '"' : ''}. Return the response in the following format: {"name": "Recipe Name", "description": "description of the dish in 1 sentence", "ingredients": [{"name": "Ingredient Name that should be the same as the input ingredients if there is any", "amount": "amount of units (integer value)", "amount_type": "count or gram"}], "saved": false, "instructions": "instructions to cook the dish, short and in markdown list format"}`
  });
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    messages
  });
  if (quota && !quota.ai) {
    await client
      .from('users')
      .update({ free_ai_calls: quota.free_ai_calls - 1 })
      .eq('id', user.id);
  }

  return JSON.parse(result.text);
});
