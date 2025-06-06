<script lang="ts" setup>
import { ref } from 'vue';
import { Menu } from 'lucide-vue-next';
import ToggleTheme from '~/components/landing-page/ToggleTheme.vue';

interface RouteProps {
  href: string;
  label: string;
}

const routeList: RouteProps[] = [
  {
    href: '#features',
    label: 'Features'
  },
  {
    href: '#usage',
    label: 'Usage'
  },
  {
    href: '#recipes',
    label: 'Recipes'
  },
  {
    href: '#pricing',
    label: 'Pricing'
  },
  {
    href: '#contact',
    label: 'Contact'
  }
];

const isOpen = ref<boolean>(false);
</script>

<template>
  <header
    class="sticky top-5 z-40 mx-auto flex w-[90%] items-center justify-between rounded-xl border-none bg-white/10 p-2 px-4 shadow-md backdrop-blur-lg dark:border dark:border-solid dark:bg-black/10 md:w-[70%] lg:w-[75%] lg:max-w-screen-xl">
    <a href="/" class="flex items-center">
      <span
        class="bg-gradient-to-r from-red-600 to-yellow-500 bg-clip-text text-lg font-bold tracking-wide text-transparent dark:to-yellow-300">
        FOODERINO
      </span>
    </a>
    <!-- Mobile -->
    <div class="block items-center lg:hidden">
      <Sheet v-model:open="isOpen">
        <SheetTrigger as-child>
          <Menu @click="isOpen = true" class="cursor-pointer" />
        </SheetTrigger>

        <SheetContent side="left" class="flex flex-col justify-between rounded-br-2xl rounded-tr-2xl bg-card">
          <div>
            <SheetHeader class="mb-4 ml-4">
              <SheetTitle class="flex items-center">
                <a href="/" class="flex items-center">
                  <span
                    class="bg-gradient-to-r from-red-600 to-yellow-300 bg-clip-text text-lg font-bold tracking-wide text-transparent">
                    FOODERINO
                  </span>
                </a>
              </SheetTitle>
            </SheetHeader>

            <div class="flex flex-col gap-2">
              <Button
                v-for="{ href, label } in routeList"
                :key="label"
                as-child
                variant="ghost"
                class="justify-start text-base">
                <a @click="isOpen = false" :href="href">
                  {{ label }}
                </a>
              </Button>
            </div>
          </div>

          <SheetFooter class="flex-col items-start justify-start sm:flex-col">
            <Separator class="mb-2" />

            <ToggleTheme />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>

    <!-- Desktop -->
    <NavigationMenu class="hidden lg:block">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Button
              v-for="{ href, label } in routeList"
              :key="label"
              as-child
              variant="ghost"
              class="justify-start text-base hover:bg-gray-500/20">
              <a :href="href">
                {{ label }}
              </a>
            </Button>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>

    <div class="hidden gap-2 lg:flex">
      <ToggleTheme />
      <Button as-child variant="ghost" class="justify-start text-base hover:bg-gray-500/20">
        <NuxtLink class="group/arrow font-bold" to="/login"> Login </NuxtLink>
      </Button>
    </div>
  </header>
</template>

<style scoped>
.shadow-light {
  box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.085);
}

.shadow-dark {
  box-shadow: inset 0 0 5px rgba(255, 255, 255, 0.141);
}
</style>
