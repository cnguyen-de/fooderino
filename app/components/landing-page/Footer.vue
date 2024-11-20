<script setup lang="ts">
import { ChevronsDown } from 'lucide-vue-next';
</script>

<template>
  <footer id="footer" class="container">
    <div class="rounded-2xl p-10">
      <div class="grid grid-cols-2 gap-x-12 gap-y-8 md:grid-cols-2">
        <div class="col-span-full xl:col-span-2">
          <a href="#" class="flex items-center font-bold">
            <span
              class="bg-gradient-to-r from-red-600 to-yellow-300 bg-clip-text text-lg font-bold tracking-wide text-transparent">
              FOODERINO
            </span>
          </a>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-bold">About us</h3>
          <a href="https://may-solutions.io" target="_blank" class="opacity-60 hover:opacity-100"> may-solutions.io </a>
          <div class="opacity-60 hover:opacity-100">
            <Sheet>
              <SheetTrigger>Imprint</SheetTrigger>
              <SheetContent side="bottom">
                <SheetHeader>
                  <SheetTitle class="">Imprint</SheetTitle>
                  <SheetDescription>
                    <div class="max-w-2xl text-left text-white">
                      <p>May Solutions UG (haftungsbeschränkt)</p>
                      <p>Ella-Bergmann-Michel-Str. 3, 60438, Frankfurt am Main</p>
                      <p>Geschäftsführer: Minh Chi Nguyen</p>
                      <a href="mailto:contact@may-solutions.io">contact@may-solutions.io</a>
                      <p>Registergericht Amtsgericht Frankfurt am Main HRB 135446</p>
                      <p>USt-IDnr: DE370068156</p>
                    </div></SheetDescription
                  >
                </SheetHeader>
                <SheetFooter class="mt-2 !flex-col">
                  <SheetClose class="self-start">
                    <Button variant="outline"> Close </Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-bold">Help</h3>
          <a href="#contact" class="opacity-60 hover:opacity-100"> Contact Us </a>
          <a href="#" class="opacity-60 hover:opacity-100"> Feedback </a>
        </div>
      </div>

      <Separator class="my-6" />
      <section>
        <h3 class="">&copy; 2024 May Solutions UG. All rights reserved.</h3>
      </section>
    </div>
  </footer>
</template>
