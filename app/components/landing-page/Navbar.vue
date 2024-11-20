<script lang="ts" setup>
import { ref } from 'vue';
import { ChevronsDown, Menu } from 'lucide-vue-next';
import GithubIcon from '@/icons/GithubIcon.vue';
import ToggleTheme from '~/components/landing-page/ToggleTheme.vue';
import { useColorMode } from '@vueuse/core';

interface RouteProps {
  href: string;
  label: string;
}

interface FeatureProps {
  title: string;
  description: string;
}

const routeList: RouteProps[] = [
  {
    href: '#features',
    label: 'Features'
  },
  {
    href: '#testimonials',
    label: 'Testimonials'
  },
  {
    href: '#pricing',
    label: 'Pricing'
  },
  {
    href: '#team',
    label: 'Team'
  },
  {
    href: '#contact',
    label: 'Contact'
  },
  {
    href: '#faq',
    label: 'FAQ'
  }
];

const featureList: FeatureProps[] = [
  {
    title: 'Showcase Your Value ',
    description: 'Highlight how your product solves user problems.'
  },
  {
    title: 'Build Trust',
    description: 'Leverages social proof elements to establish trust and credibility.'
  },
  {
    title: 'Capture Leads',
    description: 'Make your lead capture form visually appealing and strategically.'
  }
];

const isOpen = ref<boolean>(false);
const mode = useColorMode();
</script>

<template>
  <header
    :class="{
      'shadow-light': mode === 'light',
      'shadow-dark': mode === 'dark',
      'sticky top-5 z-40 mx-auto flex w-[90%] items-center justify-between rounded-2xl border bg-transparent p-2 px-4 shadow-md backdrop-blur-sm md:w-[70%] lg:w-[75%] lg:max-w-screen-xl': true
    }">
    <a href="/" class="flex items-center">
      <span
        class="bg-gradient-to-r from-red-600 to-yellow-300 bg-clip-text text-lg font-bold tracking-wide text-transparent">
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
              class="justify-start text-base">
              <a :href="href">
                {{ label }}
              </a>
            </Button>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>

    <div class="hidden lg:flex">
      <ToggleTheme />
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
