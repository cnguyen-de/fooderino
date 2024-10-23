<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';

const { messages, input, handleSubmit } = useChat();
</script>

<template>
  <div
    class="stretch relative mx-auto flex max-h-[80%] w-full max-w-md flex-col items-start justify-start overflow-y-scroll p-4 text-white">
    <div v-for="m in messages" :key="m.id" class="whitespace-pre-wrap">
      {{ m.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ m.content }}
    </div>

    <form @submit="handleSubmit">
      <input
        class="fixed bottom-10 mb-8 w-[calc(100%_-_32px)] rounded border border-gray-300 p-2 text-gray-800 shadow-xl"
        v-model="input"
        placeholder="Say something..." />
    </form>
  </div>
</template>
