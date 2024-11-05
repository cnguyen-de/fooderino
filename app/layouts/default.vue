<template>
  <div class="relative h-full w-full">
    <div
      class="absolute inset-0 -z-10 h-full w-full bg-[url('https://images.unsplash.com/photo-1444731961956-751ed90465a5?q=80&w=2574&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')] bg-cover bg-center blur"></div>

    <div class="relative mx-auto flex h-screen max-w-xl flex-col bg-gray-950/90 backdrop-blur-lg">
      <div
        class="fixed flex h-12 w-full items-center justify-center border-b border-solid border-gray-600/50 bg-transparent">
        <span class="bg-gradient-to-r from-red-600 to-yellow-300 bg-clip-text font-bold tracking-wide text-transparent">
          FOODERINO
        </span>
      </div>
      <div class="relative h-full w-full pt-12">
        <slot></slot>
      </div>

      <div class="fixed bottom-16">
        <ActionBar></ActionBar>
      </div>
      <div class="fixed bottom-0 h-16 w-full bg-black/40">
        <Footer></Footer>
      </div>
    </div>
  </div>
</template>
