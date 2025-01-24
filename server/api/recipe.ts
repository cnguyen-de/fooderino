import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';
import { Settings } from '~~/types/Settings';

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  const client = await serverSupabaseClient(event);

  // Check if user has AI rights
  if (typeof user === 'undefined' || user === null) {
    return { settings: null };
  }
  let hasAIRight = false;
  const userInfos = await client.from('users').select().eq('id', user.id);
  let userSettings: Settings = {};
  if (userInfos.data?.length > 0) {
    userSettings = userInfos.data[0];
    if (userSettings?.ai || (!userSettings?.ai && userSettings?.free_ai_calls > 0)) {
      hasAIRight = true;
    }
  }
  if (!hasAIRight) {
    throw createError({
      status: 401,
      message: 'Your free AI generation has exceeded the limit. Please upgrade your account to generate more recipes.'
    });
  }

  // Gather current user preferences
  const reqQuery = getQuery(event);
  const recipes = await client.from('recipes').select('name').eq('id', user.id);
  const userKnownRecipes = recipes.data?.map((recipe) => recipe?.name).join(', ');
  const userAllergies = userSettings.allergies ?? 'no allergies';
  const userServings = userSettings.servings ?? '1';
  const userFavCuisines = userSettings.cuisines ?? 'no preferences';
  const useHasIngredients = reqQuery?.useHasIngredients === 'true' || false;
  const userCustomRequest = reqQuery?.request ?? '';
  let userHasIngredients = '';
  if (useHasIngredients) {
    const listId = reqQuery.listId ?? null;
    if (!listId) throw new Error('Missing listId');
    const inventoryItems = await client.from('items').select('name').gte('amount', 1).eq('list_id', listId);
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
  if (!userSettings?.ai) {
    await client
      .from('users')
      .update({ free_ai_calls: userSettings?.free_ai_calls - 1 })
      .eq('id', user.id);
  }

  return JSON.parse(result.text);
});
