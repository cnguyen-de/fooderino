<script setup lang="ts">
import jsQR from 'jsqr';
import { toast } from 'vue-sonner';

/**
 * In-app scanning for when Fooderino is already open. The primary path is the
 * phone's stock camera opening the join URL; this is the secondary one.
 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [boolean] }>();

const video = ref<HTMLVideoElement | null>(null);
const error = ref('');
let stream: MediaStream | null = null;
let frame = 0;
const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const ctx = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;

/** Only our own join links are accepted; any other QR is ignored. */
function tokenFrom(text: string): string | null {
  try {
    const url = new URL(text);
    if (url.pathname !== '/join') return null;
    return url.searchParams.get('t');
  } catch {
    return null;
  }
}

function stop(): void {
  cancelAnimationFrame(frame);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

function tick(): void {
  const v = video.value;
  if (!v || !stream || !canvas || !ctx) return;

  if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
    const token = code ? tokenFrom(code.data) : null;
    if (token) {
      stop();
      emit('update:open', false);
      navigateTo({ path: '/join', query: { t: token } });
      return;
    }
  }
  frame = requestAnimationFrame(tick);
}

async function start(): Promise<void> {
  error.value = '';
  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = 'This browser cannot use the camera. Open the share link instead.';
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    // The drawer may have closed while the permission prompt was up.
    if (!props.open) return stop();
    await nextTick();
    if (!video.value) return stop();
    video.value.srcObject = stream;
    await video.value.play();
    frame = requestAnimationFrame(tick);
  } catch {
    stop();
    error.value = 'Camera access was blocked. Allow it, or open the share link instead.';
    toast('Could not open the camera');
  }
}

watch(
  () => props.open,
  (open) => (open ? void start() : stop())
);
onBeforeUnmount(stop);
</script>

<template>
  <Drawer :open="open" @update:open="emit('update:open', $event)">
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Join a household</DrawerTitle>
        <DrawerDescription>Point your camera at a Fooderino share code.</DrawerDescription>
      </DrawerHeader>
      <div class="flex flex-col items-center gap-3 px-4 pb-6">
        <p v-if="error" class="text-center text-sm text-red-500">{{ error }}</p>
        <video v-else ref="video" class="aspect-square w-full max-w-xs rounded-lg bg-black object-cover" muted playsinline />
      </div>
    </DrawerContent>
  </Drawer>
</template>
