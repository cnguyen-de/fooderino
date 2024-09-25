<template>
  <div class="relative">
    <div class="absolute -z-10 w-full h-full blur bg-[url('https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=2500&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')]"></div>
    <div class="relative flex flex-col h-dvh max-w-xl mx-auto bg-black/50 backdrop-blur-xl">
      <div class="h-12 flex items-center p-2">header</div>
      <div class="flex-grow">
        <slot></slot>
      </div>
      <div class="h-12"><Footer></Footer></div>
    </div>
  </div>
</template>
