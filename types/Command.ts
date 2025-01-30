import type { Item } from './Item';

export interface Command {
  type: string;
  payload: Item;
}
