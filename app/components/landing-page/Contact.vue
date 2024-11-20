<script setup lang="ts">
import { AlertCircle, Building2, Phone, Mail, Clock } from 'lucide-vue-next';

interface ContactFormProps {
  firstName: string;
  lastName: string;
  subject: string;
  message: string;
}

const contactForm = reactive<ContactFormProps>({
  firstName: '',
  lastName: '',
  subject: 'Other',
  message: ''
});

const invalidInputForm = ref<boolean>(false);

const handleSubmit = () => {
  const { firstName, lastName, subject, message } = contactForm;

  const mailToLink = `mailto:contact+fooderino@may-solutions.io?subject=${subject}&body=${message} %0D%0A ${firstName} ${lastName}`;

  window.location.href = mailToLink;
};
</script>

<template>
  <section id="contact" class="container py-24 sm:py-32">
    <section class="grid grid-cols-1 gap-8 md:grid-cols-2">
      <div>
        <div class="mb-4">
          <h2 class="mb-2 text-lg tracking-wider text-primary">Contact</h2>

          <h2 class="text-3xl font-bold md:text-4xl">Contact Us</h2>
        </div>
        <p class="mb-8 text-muted-foreground lg:w-5/6">
          Do you have any questions, feedback, or suggestions? We would love to hear from you! Feel free to reach out to
          us
        </p>

        <div class="flex flex-col gap-4">
          <div class="mb-1 flex gap-2">
            <Mail />
            <h4 class="font-bold">Mail Us</h4>
          </div>

          <p>contact+fooderino@may-solutions.io</p>
        </div>
      </div>

      <!-- form -->
      <Card class="bg-muted/60 dark:bg-card">
        <CardHeader class="text-2xl text-primary"> </CardHeader>
        <CardContent>
          <form @submit.prevent="handleSubmit" class="grid gap-4">
            <div class="flex flex-col gap-8 md:flex-row">
              <div class="flex w-full flex-col gap-1.5">
                <Label for="first-name">First Name</Label>
                <Input id="first-name" type="text" placeholder="Max" v-model="contactForm.firstName" />
              </div>

              <div class="flex w-full flex-col gap-1.5">
                <Label for="last-name">Last Name</Label>
                <Input id="last-name" type="text" placeholder="Mustermann" v-model="contactForm.lastName" />
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <Label for="subject">Subject</Label>

              <Select v-model="contactForm.subject">
                <SelectTrigger>
                  <SelectValue placeholder="Select a subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="Bug"> Bug </SelectItem>
                    <SelectItem value="Feature Request"> Feature Request </SelectItem>
                    <SelectItem value="Suggestions"> Suggestions </SelectItem>
                    <SelectItem value="Other"> Other </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div class="flex flex-col gap-1.5">
              <Label for="message">Message</Label>
              <Textarea id="message" placeholder="Your message..." rows="5" v-model="contactForm.message" />
            </div>

            <Alert v-if="invalidInputForm" variant="destructive">
              <AlertCircle class="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription> There is an error in the form. Please check your input. </AlertDescription>
            </Alert>

            <Button class="mt-4">Continue in your email app</Button>
          </form>
        </CardContent>

        <CardFooter></CardFooter>
      </Card>
    </section>
  </section>
</template>
