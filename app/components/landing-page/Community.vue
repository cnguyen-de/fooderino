<script setup lang="ts">
import DiscordIcon from '@/icons/DiscordIcon.vue';
</script>

<template>
  <section id="community" class="py-12">
    <hr />
    <div class="container py-20 sm:py-20">
      <div class="mx-auto lg:w-[60%]">
        <Card class="flex flex-col items-center justify-center border-0 bg-background text-center shadow-none">
          <CardHeader>
            <CardTitle class="text-4xl font-bold md:text-5xl">
              <Component class="m-auto mb-4 h-20 w-20" :is="DiscordIcon" />
              Ready to join this
              <span class="bg-gradient-to-r from-[#D247BF] to-primary bg-clip-text text-transparent"> Community? </span>
            </CardTitle>
          </CardHeader>
          <CardContent class="text-xl text-muted-foreground lg:w-[80%]">
            Join our vibrant Discord community! Connect, share, and grow with like-minded enthusiasts. Click to dive in!
            🚀
          </CardContent>

          <CardFooter>
            <Button as-child>
              <a href="https://discord.com/" target="_blank"> Join Discord </a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
    <hr />
  </section>
</template>
