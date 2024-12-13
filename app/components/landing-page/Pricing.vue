<script setup lang="ts">
import { BadgeCheck } from 'lucide-vue-next';
import { toast } from 'vue-sonner';

enum Plan {
  FREE = 0,
  PRO = 1,
  BUY_ONCE = 2
}
enum PopularPlan {
  NO = 0,
  YES = 1
}

interface PlanProps {
  id: number;
  title: string;
  popular: PopularPlan;
  price: number;
  description: string;
  buttonText: string;
  benefitList?: string[];
}

const plans: PlanProps[] = [
  {
    id: 0,
    title: 'Free',
    popular: 0,
    price: 0,
    description: 'Free forever.',
    buttonText: 'Start For Free',
    benefitList: ['1 List', '2 Shared Members', 'AI Assistance', '10 Recipes Suggestions per Month', 'Feature Request']
  },
  {
    id: 1,
    title: 'Pro',
    popular: 1,
    price: 2,
    description: 'Unlock the full potential of Fooderino, with stronger AI models and custom control.',
    buttonText: 'Select Plan',
    benefitList: [
      'Unlimited Lists',
      'Unlimited Invites',
      'Extensive AI Assistance',
      'Refined Control over GenAI',
      'High Priority Support'
    ]
  },
  {
    id: 2,
    title: 'Buy Once Use Forever',
    popular: 0,
    price: 20,
    description: 'With all of Pro features, but you only pay once.',
    buttonText: 'Buy Now',
    benefitList: [
      'Unlimited Lists',
      'Unlimited Invites',
      'Extensive AI Assistance',
      'Refined Control over GenAI',
      'High Priority Support'
    ]
  }
];

const handlePricingButton = (id: number) => {
  console.log('Selected Plan:', plans[id].title);
  if (id === Plan.FREE) {
    navigateTo('/signup');
  } else if (id === Plan.PRO) {
    //navigateTo('/payment');
    toast('Coming soon');
  } else {
    toast('Coming soon');
    // strip link buy once
  }
};
</script>

<template>
  <section id="pricing" class="container py-24 sm:py-32">
    <h2 class="mb-2 text-center text-lg tracking-wider text-primary">Pricing</h2>

    <h2 class="mb-4 text-center text-3xl font-bold md:text-4xl">Get unlimitted access</h2>

    <h3 class="mx-auto pb-14 text-center text-xl text-muted-foreground md:w-1/2">
      Utilize the full potential of Fooderino with LLM-based AI assistance, priority support, and more.
    </h3>

    <div class="grid gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
      <Card
        v-for="{ id, title, popular, price, description, buttonText, benefitList } in plans"
        :key="title"
        class="flex flex-col"
        :class="{
          'border-[1.5px] border-primary shadow-black/10 drop-shadow-xl dark:shadow-white/10 lg:scale-[1.1]':
            popular === PopularPlan?.YES
        }">
        <CardHeader>
          <CardTitle class="pb-2">
            {{ title }}
          </CardTitle>

          <CardDescription class="pb-4">{{ description }}</CardDescription>

          <div>
            <span class="text-3xl font-bold">€{{ price }}</span>
            <span class="text-muted-foreground"> /month</span>
          </div>
        </CardHeader>

        <CardContent class="flex grow">
          <div class="space-y-4">
            <span v-for="benefit in benefitList" :key="benefit" class="flex">
              <BadgeCheck class="mr-2 text-primary" />
              <h3>{{ benefit }}</h3>
            </span>
          </div>
        </CardContent>

        <CardFooter>
          <Button
            :variant="popular === PopularPlan?.NO ? 'secondary' : 'default'"
            class="w-full"
            @click="handlePricingButton(id)">
            {{ buttonText }}
          </Button>
        </CardFooter>
      </Card>
    </div>
  </section>
</template>
