export interface Recipe {
  index: number;
  /** User ID which created the recipe */
  id: string;
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
