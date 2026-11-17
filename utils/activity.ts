import type { CommandKind, CommandLogRow, Item, ItemEvent, ItemId } from '~~/types/pantry';
import type { QueuedCommand } from '~~/types/sync';

export interface ActivityEntry {
  id: string;
  at: string;
  actor: string | null;
  itemIds: ItemId[];
  names: string;
  description: string;
  detail: string;
  kind: CommandKind | ItemEvent['kind'];
  pending: boolean;
}

const labels: Record<CommandKind, string> = {
  create: 'Added item',
  use: 'Used item',
  want: 'Updated shopping list',
  tick: 'Bought item',
  cancel_bag: 'Removed from bag',
  unpack: 'Unpacked',
  set: 'Adjusted stock',
  undo: 'Undid change',
  dismiss: 'Skipped suggestion',
  merge: 'Merged items'
};

/** Receipts cover every command; older/imported events fill the history before receipts existed. */
export function buildActivity(input: {
  items: ReadonlyMap<ItemId, Item>;
  events: readonly ItemEvent[];
  log: readonly CommandLogRow[];
  commands: readonly QueuedCommand[];
}): ActivityEntry[] {
  const { items, events, log, commands } = input;
  const linked = new Map(events.filter((e) => e.command_id).map((e) => [e.command_id!, e]));
  const seen = new Set<string>();
  const result: ActivityEntry[] = [];
  function add(
    id: string,
    at: string,
    actor: string | null,
    itemIds: ItemId[],
    kind: ActivityEntry['kind'],
    pending: boolean,
    event?: ItemEvent
  ) {
    const item = items.get(itemIds[0]!);
    const unit = item?.unit === 'gram' ? ' g' : '';
    const qty = (n: number) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(n)}${unit}`;
    let description = labels[kind as CommandKind] ?? 'Changed item';
    let detail = '';
    if (event?.kind === 'purchase') description = `Bought ${qty(event.qty)}`;
    if (event?.kind === 'consume' || event?.kind === 'waste') {
      description = `${event.kind === 'waste' ? 'Binned' : 'Used'} ${qty(event.qty)}`;
      detail = `${qty(event.after + event.qty)} → ${qty(event.after)} at home`;
    }
    if (event?.kind === 'correction') {
      description = kind === 'undo' || event.reverses ? 'Undid change' : 'Adjusted stock';
      const changes: string[] = [];
      if (event.before.amount !== event.after.amount)
        changes.push(`${qty(event.before.amount)} → ${qty(event.after.amount)} at home`);
      if (event.before.to_buy !== event.after.to_buy)
        changes.push(`${qty(event.before.to_buy)} → ${qty(event.after.to_buy)} to buy`);
      if (event.before.best_before !== event.after.best_before)
        changes.push(`Best before: ${event.after.best_before ?? 'cleared'}`);
      detail = changes.join(' · ');
    }
    if (event?.kind === 'dismiss') description = 'Skipped suggestion';
    result.push({
      id,
      at,
      actor,
      itemIds,
      names: itemIds.map((id) => items.get(id)?.name ?? 'Deleted item').join(' → '),
      description,
      detail,
      kind: event?.kind ?? kind,
      pending
    });
  }
  for (const row of log) {
    seen.add(row.command_id);
    add(row.command_id, row.at, row.actor, row.item_ids, row.kind, false, linked.get(row.command_id));
  }
  for (const cmd of commands) {
    if (seen.has(cmd.id)) continue;
    seen.add(cmd.id);
    add(
      cmd.id,
      cmd.at,
      null,
      cmd.kind === 'merge' ? [cmd.item_id, cmd.into] : [cmd.item_id],
      cmd.kind,
      true,
      linked.get(cmd.id)
    );
  }
  for (const event of events) {
    if (event.command_id && seen.has(event.command_id)) continue;
    add(event.id, event.occurred_at, event.actor, [event.item_id], event.kind, false, event);
  }
  return result.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
}
