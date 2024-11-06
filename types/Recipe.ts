export interface Recipe {
  name: string;
  ingredients: Ingredient[];
}

export interface Ingredient {
  name: string;
  amount: number;
  amount_type: 'count' | 'gram';
}
