<template>
  <div class="relative h-full w-full">
    <div
      class="absolute -z-10 h-full w-full bg-[url('https://images.unsplash.com/photo-1444731961956-751ed90465a5?q=80&w=2574&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')] bg-cover bg-center blur"></div>
    <div class="relative mx-auto flex h-screen max-w-xl flex-col bg-black/80 backdrop-blur-xl">
      <div
        class="flex h-12 items-center justify-center bg-gradient-to-r from-red-600 to-yellow-300 bg-clip-text p-2 font-bold tracking-wide text-transparent">
        FOODERINO
      </div>
      <div class="relative h-[calc(100dvh_-_3rem)]">
        <slot></slot>
      </div>
      <div class="fixed bottom-0 h-16 w-full">
        <Footer></Footer>
      </div>
      <div class="absolute bottom-16 right-16">
        <CreateNewItem></CreateNewItem>
      </div>
    </div>
  </div>
</template>
