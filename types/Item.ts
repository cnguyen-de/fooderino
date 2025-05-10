export interface Item {
  id: number;
  name: string;
  location: string;
  store: string;
  default_amount: number;
  amount: number;
  amount_type: string;
  amount_to_purchase: number;
  createdAt: Date;
  user: string;
  times_updated: number;
  last_updated: Date;
}
