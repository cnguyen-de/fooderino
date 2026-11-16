# Household Redesign — Product Decisions

**Date:** 2026-11-16
**Status:** Agreed with the owner in a grilling session. Technical shape is designed separately.
**Builds on:** `2026-08-25-local-first-sync-design.md`. The v2 schema has **not** been applied to the
hosted Supabase project yet, so this redesign amends `supabase/schema-v2.sql` and
`supabase/backfill-v2.sql` and ships in the same cutover. Users migrate once.

## Goal

After two years of use, the multi-list checklist no longer fits. The owner wants one home
inventory and one shopping list per household, items findable by any of several names or tags,
and the app to suggest what to buy from purchase history and what to use from expiry dates.

The three core loops, in priority order:

1. **Find and remove.** Quickly find an item at home and mark it used.
2. **Add while shopping.** Quickly add an item to the shopping list, including brand-new items.
3. **Suggest.** Propose what to buy (from cadence) and what to use or toss (from expiry).

## Decisions

### Households (Q1, Q1a, Q1b, Q1c)

- A user belongs to **exactly one household**. A household owns one home inventory and one
  shopping list. Members share everything in it.
- A new user either **creates** a household or **joins** one by scanning a QR share code (the
  existing `/join` flow).
- **Migration:** each existing list becomes its own household. A user who is a member of more
  than one sees a one-time "Pick your household" screen. The others are left (membership
  removed); their items can be imported into the chosen household in one tap. Nothing merges
  silently, so no item is shown to people who could not already see it.
- **Leaving** a household is allowed. Items stay with the household. The leaver starts empty.
- **Joining with existing items** asks first, defaulting to "bring them along". Items whose name
  or alias matches an existing item merge into it: counts add, tags union, aliases union.

### Items (Q2, Q3, Q4, Q13)

- An item is a **product**, not a batch. It has one count at home and one `best_before` holding
  the soonest expiry.
- An item has **one display name plus aliases**. Search matches all of them. Name is not
  unique and is not an identifier.
- Counts stay numeric. The main home action is a large **−1 / used up**, not a number field.
- **Tags replace `location` and `store`.** Each tag has a kind: `place` (fridge, pantry),
  `store` (Lidl, Asian market), or `other` (dairy, breakfast). Existing `location` values
  become place tags and `store` values become store tags.
- Items at 0 are hidden from Home but always found by search.
- `show_empty_items` and `no_inventory` are removed. `user_settings` has no synced fields left
  and is dropped.

### Shopping, basket and unpack (Q5)

- The basket stays, renamed **"In the bag"**. Ticking an item in the shop moves it from the
  shopping list into the bag, not into the home.
- **Unpacking** moves bag items into home stock. The unpack screen shows each item's place tag
  so you know where it goes, and lets you set one if missing.
- **Store tags never appear in the Home UI.** They only group the shopping list.

### Expiry (Q9)

- Items carry an optional **shelf life in days**. Unpacking pre-fills
  `best_before = today + shelf life`, editable inline.
- Because an item holds one date, unpack only replaces `best_before` when the new date is
  sooner, or the stock was 0.
- Items with no shelf life and no date are never nagged about.

### Home (Q10, Q11)

- Home is **search-first**: a search box pinned at the bottom (thumb reach), typo-tolerant,
  matching names, aliases and tags. Each result row has a one-tap −1. Tapping the row opens
  the edit sheet. Every decrement shows an undo toast.
- With the search empty, Home shows **Use soon** (near or past `best_before`) first, then
  everything in stock grouped by place tag.
- Use soon offers **used it** (−1, consumption) and **binned it** (−1, logged as waste). Waste
  never counts toward consumption rate.

### Buy suggestions (Q8, Q8a–Q8d)

- No manual "staple" flag. **History decides.**
- An item has a **cadence** once it has ≥ 3 purchases in the last 6 months. It is **due** when
  days since last purchase ≥ ~80% of its median gap between purchases. It is held back while
  home stock already covers a typical purchase.
- Suggested quantity is the **median** purchase amount.
- Due items appear **inside the shopping list** in a faded **"Probably need"** section. Tick them
  like anything else, or swipe to dismiss. Dismissing snoozes the item for one cycle.
- An item that hits 0 with no cadence lands in a collapsed **"Ran out"** group.
- Thresholds get tuned against real backfilled history, not guessed.

### History (Q12)

- Today's logs are free text keyed by item **name** (`payload: "2 → 3"`), pruned to 200 on
  device. That cannot drive suggestions. They are replaced by **typed events keyed by item id**
  (purchase, consume, waste, correction).
- The migration backfills typed events from the legacy `logs` table best-effort: an increase is
  a purchase, a decrease is consumption. Only the last 6 months drive cadence, so old noise
  ages out. The hosted project holds 2,566 legacy log rows (2025-05-11 to 2026-11-15).

### Recipes (Q6, Q6a)

- **AI recipe generation is removed completely**: `/api/chat`, `/api/recipe`, the quota
  endpoint, `recipe/ai.vue`, `GeneratedRecipeList`, the servings/allergies/cuisines settings,
  the AI quota UI, the landing-page AI copy, and the OpenAI dependencies.
- **Manual recipes stay** as they are.

## Out of scope

- Push notifications for suggestions.
- Multiple households per user.
- Per-batch expiry.

## Known issue surfaced during grounding

The legacy `logs` table on the hosted project is readable with the anon key, emails included.
The cutover's `drop-legacy.sql` removes it, but until then it is exposed.
