<script setup lang="ts">
import { CookingPot, House, Settings, ShoppingCart } from 'lucide-vue-next';
</script>

<template>
  <div class="flex h-full flex-row items-center justify-between border-t border-solid border-gray-500/50 p-2">
    <FooterLink link="/home">
      <House></House>
    </FooterLink>
    <FooterLink link="/shop">
      <div class="flex flex-row">
        <ShoppingCart> </ShoppingCart>
      </div>
    </FooterLink>
    <FooterLink link="/recipe" include-child>
      <CookingPot></CookingPot>
    </FooterLink>
    <FooterLink link="/settings">
      <Settings></Settings>
    </FooterLink>
  </div>
</template>
