<script setup lang="ts">
import LinkedInIcon from '@/icons/LinkedInIcon.vue';
import GithubIcon from '@/icons/GithubIcon.vue';
import XIcon from '@/icons/XIcon.vue';

interface TeamProps {
  imageUrl: string;
  firstName: string;
  lastName: string;
  positions: string[];
  socialNetworks: SocialNetworkProps[];
}

interface SocialNetworkProps {
  name: string;
  url: string;
}

const teamList: TeamProps[] = [
  {
    imageUrl: 'https://www.cnguyen.de/avatar.webp',
    firstName: 'Chi',
    lastName: 'Nguyen',
    positions: ['Product Engineer', 'Creator of Fooderino'],
    socialNetworks: [
      {
        name: 'LinkedIn',
        url: 'https://www.linkedin.com/in/leopoldo-miranda/'
      },
      {
        name: 'X',
        url: 'https://x.com/leo_mirand4'
      }
    ]
  }
];

const socialIcon = (socialName: string) => {
  switch (socialName) {
    case 'LinkedIn':
      return LinkedInIcon;

    case 'X':
      return XIcon;
  }
};
</script>

<template>
  <section id="team" class="container py-24 sm:py-32">
    <div class="mb-8 text-center">
      <h2 class="mb-2 text-center text-lg tracking-wider text-primary">Team</h2>
      <h3 class="text-center text-3xl font-bold md:text-4xl">The Solo Dev</h3>
    </div>

    <div class="grid grid-cols-1 place-items-center gap-8">
      <Card
        v-for="{ imageUrl, firstName, lastName, positions, socialNetworks } in teamList"
        :key="imageUrl"
        class="group/hoverimg flex h-full w-full flex-col overflow-hidden bg-muted/60 dark:bg-card md:w-96">
        <CardHeader class="gap-0 p-0">
          <div class="h-full overflow-hidden">
            <img
              :src="imageUrl"
              alt=""
              class="aspect-square size-full w-full object-cover saturate-0 transition-all duration-200 ease-linear group-hover/hoverimg:scale-[1.01] group-hover/hoverimg:saturate-100" />
          </div>
          <CardTitle class="px-6 py-6 pb-4">
            <span class="text-primary">{{ firstName }} {{ lastName }}</span>
          </CardTitle>
        </CardHeader>

        <CardContent
          v-for="(position, index) in positions"
          :key="index"
          :class="{
            'pb-0 text-muted-foreground': true,
            'pb-4': index === positions.length - 1
          }">
          {{ position }}<span v-if="index < positions.length - 1">,</span>
        </CardContent>

        <CardFooter class="mt-auto space-x-4">
          <a
            v-for="{ name, url } in socialNetworks"
            key="name"
            :href="url"
            target="_blank"
            class="transition-all hover:opacity-80"
            :aria-label="`Visit our ${name} page`">
            <component :is="socialIcon(name)" />
          </a>
        </CardFooter>
      </Card>
    </div>
  </section>
</template>
