import type { ItemRecord } from './sync';

export interface Command {
  type: string;
  payload: ItemRecord;
}
