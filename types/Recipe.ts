export interface Recipe {
  name: string;
  description: string;
  ingredients: Ingredient[];
  saved: boolean;
  instructions: string;
}

export interface Ingredient {
  name: string;
  amount: number;
  amount_type: 'count' | 'gram';
}
