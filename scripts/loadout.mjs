/**
 * Loadout column: a column of boxes on the left of the slots, supplied entirely by the system
 * module (`loadout` in registerSystem). With none, the column doesn't show.
 *
 *   loadout: {
 *     label                         name in the show / hide list, e.g. "Weapon Loadout"
 *     prepare(actor)                -> [{ slot, img, name, cssClass?, uuid? }, ...]  one per box
 *     menuOptions(bar)              -> context menu entries for a box (li.dataset.slot is the box)
 *     click(bar, event, target)     click a box
 *     drop(bar, event, target)      drop onto a box
 *   }
 */

import { activeSystem } from "./system.mjs";

function source() {
  return activeSystem()?.loadout ?? null;
}

/** Context for the template, or null with no actor or no loadout. */
export function prepareLoadout(actor) {
  const loadout = source();
  if ( !actor || !loadout?.prepare ) return null;
  const boxes = loadout.prepare(actor);
  return boxes?.length ? boxes : null;
}

export function loadoutMenuOptions(bar) {
  return source()?.menuOptions?.(bar) ?? [];
}

/** Click a loadout box. @this {NexusHotbar} */
export async function onLoadoutUse(event, target) {
  return source()?.click?.(this, event, target);
}

/** Drop onto a loadout box. */
export async function onDropLoadout(bar, event) {
  const el = event.target.closest(".nex-loadout-slot");
  if ( !el || !bar.actor ) return;
  return source()?.drop?.(bar, event, el);
}
