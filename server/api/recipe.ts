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
  const userInfos = await client.from('users').select().eq('uid', user.id);
  let userSettings: Settings = {};
  if (userInfos.data?.length > 0) {
    userSettings = userInfos.data[0];
    if (userSettings?.ai) {
      hasAIRight = true;
    }
  }
  if (!hasAIRight) {
    return { content: 'User does not have AI functionality' };
  }

  // Gather current user preferences
  const reqQuery = getQuery(event);
  const recipes = await client.from('recipes').select().eq('id', user.id);
  const userKnownRecipes = reqQuery.recipes ?? recipes.data?.map((recipe) => recipe?.name).join(', ');
  const userAllergies = userSettings.allergies ?? 'no allergies';
  const userServings = userSettings.servings ?? '1';
  const userFavCuisines = userSettings.cuisines ?? 'no preferences';

  // Init LLM AI with user knowledge
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({
    apiKey: apiKey
  });
  const messages = [];
  messages.push({
    role: 'system',
    content: `You are suggesting new recipes for ${userServings} servings. The user likes ${userFavCuisines} and already have the following recipes ${userKnownRecipes} and do not suggest ingredients that are part of user's allergies ${userAllergies}. Return the response in the following format: {"name": "Recipe Name", "description": "description of the dish in 1 sentence", "ingredients": [{"name": "Ingredient Name", "amount": "amount of units (integer value)", "amount_type": "count or gram"}], "saved": false}`
  });
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    messages
  });
  return JSON.parse(result.text);
});
