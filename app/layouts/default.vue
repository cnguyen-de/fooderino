<template>
  <div
    class="relative">
    <div
      class="absolute -z-10 h-full w-full bg-[url('https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=2500&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')] blur"></div>
    <div
      class="relative mx-auto flex h-dvh max-w-xl flex-col bg-black/80 backdrop-blur-xl">
      <div
        class="flex h-12 items-center tracking-wide  font-bold justify-center bg-gradient-to-r from-red-600 to-yellow-300 bg-clip-text p-2 text-transparent">
        FOODERINO
      </div>
      <div
        class="flex-grow">
        <slot></slot>
      </div>
      <div
        class="h-12">
        <Footer></Footer>
      </div>
    </div>
  </div>
</template>
