import { transformWithEsbuild } from 'vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { compileScript, parse } from 'vue/compiler-sfc';

// Nuxt auto-imports these in components; a page test gets them from this import instead.
const VUE_AUTO_IMPORTS =
  "import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRef, watch, watchEffect } from 'vue';\n";

export default defineConfig({
  plugins: [
    {
      // Compiles a production SFC for a page test. Components and composables come from the test's stubs.
      name: 'test-vue-sfc',
      async transform(source, id) {
        if (!id.endsWith('.vue')) return;
        const { descriptor } = parse(source, { filename: id });
        const script = compileScript(descriptor, { id, inlineTemplate: true });
        return transformWithEsbuild(VUE_AUTO_IMPORTS + script.content, `${id}.ts`, { loader: 'ts' });
      }
    }
  ],
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('./', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url))
    }
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    globals: true
  }
});
