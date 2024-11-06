import { streamText, convertToCoreMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({
    apiKey: apiKey
  });

  return defineEventHandler(async (event: any) => {
    const { messages } = await readBody(event);
    console.log(messages);
    messages.push({
      role: 'user',
      content:
        'Suggest a recipe for me. I like vietnamese food. Return the response in the following format: {"name": "Recipe Name", "ingredients": [{"name": "Ingredient Name", "amount": "amount of units (integer value)", "amount_type": "count or gram"}]}'
    });
    console.log(messages);

    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages: convertToCoreMessages(messages)
    });
    console.log(result);

    return result.toDataStreamResponse();
  });
});
