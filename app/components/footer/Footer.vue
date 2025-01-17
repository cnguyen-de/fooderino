<script setup lang="ts">
import { useItemStore } from '~/store/item';
import { CookingPot, House, Settings, ShoppingCart } from 'lucide-vue-next';

const itemStore = useItemStore();
</script>

<template>
  <div class="flex h-full flex-row items-center justify-between border-t border-solid border-gray-500/50 p-2">
    <FooterLink link="/inventory" v-if="!useNoInventoryMode()">
      <House></House>
    </FooterLink>
    <FooterLink link="/buy">
      <div class="flex flex-row">
        <ShoppingCart> </ShoppingCart>
        <span v-if="itemStore.showBuyItemsFromAllLists" class="ml-2">ALL</span>
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
