import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  const client = await serverSupabaseClient(event);

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

  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({
    apiKey: apiKey
  });
  const messages = [];
  messages.push({
    role: 'user',
    content:
      'Suggest a recipe for me. I like vietnamese food. Return the response in the following format: {"name": "Recipe Name", "description": "description of the dish in no more than 2 sentences", "ingredients": [{"name": "Ingredient Name", "amount": "amount of units (integer value)", "amount_type": "count or gram"}]}'
  });

  const result = await generateText({
    model: openai('gpt-4o-mini'),
    messages
  });
  console.log(result);
  return JSON.parse(result.text);
});
