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
  const { data } = await client.from('users').select().eq('uid', user.id);
  if (data?.length > 0) {
    if (data[0].ai) {
      hasAIRight = true;
    }
  }
  if (!hasAIRight) {
    return { content: 'User does not have AI functionality' };
  }

  // Init LLM AI with user knowledges
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({
    apiKey: apiKey
  });
  const messages = [];
  messages.push({
    role: 'system',
    content: `You are help suggesting new recipes. The user likes ${'vietnamese food'} and already have the following recipes ${'Vietnamese Pho'}. Return the response in the following format: {"name": "Recipe Name", "description": "description of the dish in no more than 2 sentences", "ingredients": [{"name": "Ingredient Name", "amount": "amount of units (integer value)", "amount_type": "count or gram"}], "saved": false}`
  });

  const result = await generateText({
    model: openai('gpt-4o-mini'),
    messages
  });
  console.log(result);
  return JSON.parse(result.text);
});
