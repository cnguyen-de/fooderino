<script setup lang="ts">
import { Star } from 'lucide-vue-next';

interface ReviewProps {
  image: string;
  name: string;
  userName: string;
  comment: string;
  rating: number;
}

const reviewList: ReviewProps[] = [
  {
    image: 'https://github.com/shadcn.png',
    name: 'John Doe',
    userName: 'Product Manager',
    comment:
      'Wow Vue + Shadcn-Vue is awesome!. This template lets me change colors, fonts and images to match my brand identity. ',
    rating: 5.0
  },
  {
    image: 'https://github.com/shadcn.png',
    name: 'Sophia Collins',
    userName: 'Cybersecurity Analyst',
    comment:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna. ',
    rating: 4.8
  },

  {
    image: 'https://github.com/shadcn.png',
    name: 'Adam Johnson',
    userName: 'Chief Technology Officer',
    comment:
      'Lorem ipsum dolor sit amet,exercitation. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    rating: 4.9
  },
  {
    image: 'https://github.com/shadcn.png',
    name: 'Ethan Parker',
    userName: 'Data Scientist',
    comment:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod labore et dolore magna aliqua. Ut enim ad minim veniam.',
    rating: 5.0
  },
  {
    image: 'https://github.com/shadcn.png',
    name: 'Ava Mitchell',
    userName: 'IT Project Manager',
    comment:
      'Lorem ipsum dolor sit amet, tempor incididunt  aliqua. Ut enim ad minim veniam, quis nostrud incididunt consectetur adipiscing elit.',
    rating: 5.0
  },
  {
    image: 'https://github.com/shadcn.png',
    name: 'Isabella Reed',
    userName: 'DevOps Engineer',
    comment:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    rating: 4.9
  }
];
</script>

<template>
  <section id="testimonials" class="container py-24 sm:py-32">
    <div class="mb-8 text-center">
      <h2 class="mb-2 text-center text-lg tracking-wider text-primary">Testimonials</h2>

      <h2 class="mb-4 text-center text-3xl font-bold md:text-4xl">Hear What Our 1000+ Clients Say</h2>
    </div>

    <Carousel
      :opts="{
        align: 'start'
      }"
      class="relative mx-auto w-[80%] sm:w-[90%] lg:max-w-screen-xl">
      <CarouselContent>
        <CarouselItem v-for="review in reviewList" :key="review.name" class="md:basis-1/2 lg:basis-1/3">
          <Card class="bg-muted/50 dark:bg-card">
            <CardContent class="pb-0 pt-6">
              <div class="flex gap-1 pb-6">
                <Star class="size-4 fill-primary text-primary" />
                <Star class="size-4 fill-primary text-primary" />
                <Star class="size-4 fill-primary text-primary" />
                <Star class="size-4 fill-primary text-primary" />
                <Star class="size-4 fill-primary text-primary" />
              </div>

              "{{ review.comment }}"
            </CardContent>

            <CardHeader>
              <div class="flex flex-row items-center gap-4">
                <Avatar>
                  <AvatarImage src="https://www.radix-vue.com/logo.svg" alt="@radix-vue" />
                  <AvatarFallback>SV</AvatarFallback>
                </Avatar>

                <div class="flex flex-col">
                  <CardTitle class="text-lg">{{ review.name }}</CardTitle>
                  <CardDescription>{{ review.userName }}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </CarouselItem>
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  </section>
</template>
