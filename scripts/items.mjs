/**
 * Helpers for reading dnd5e items: activation types, castability, and which items
 * belong on each tab or in the passives list.
 */

import { ACTIVATIONS } from "./constants.mjs";

/** The set of activation types across all of an item's activities. */
export function activationTypes(item) {
  const types = new Set();
  for ( const activity of item.system?.activities ?? [] ) {
    const type = activity.activation?.type;
    if ( type ) types.add(type);
  }
  return types;
}

/** Does the item have at least one activity you actively use (not passive)? */
export function isActive(item) {
  const config = CONFIG.DND5E?.activityActivationTypes ?? {};
  return [...activationTypes(item)].some(t => !config[t]?.passive && (t !== "none"));
}

/** Can this spell be cast right now (cantrip, prepared, or doesn't need preparing)? */
export function isCastable(spell) {
  const sys = spell.system;
  if ( !sys.level ) return true;
  if ( !sys.canPrepare ) return true;
  return Number(sys.prepared) > 0;
}

/** The first of action / bonus / reaction the item uses, or null. */
export function primaryActivation(types) {
  return Object.keys(ACTIVATIONS).find(t => types.has(t)) ?? null;
}

const INVENTORY_ORDER = { weapon: 0, equipment: 1, consumable: 2, tool: 3 };
const ACTIVATION_ORDER = { action: 0, bonus: 1, reaction: 2 };
const FEATURE_ORDER = { class: 0, subclass: 1, race: 2, species: 2, background: 3, feat: 4 };

const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang);

/** Items that belong on a tab when auto-filling, in display order. */
export function autoFillCandidates(actor, tab) {
  const items = actor.items.filter(i => i.system.activities?.size && isActive(i));

  switch ( tab ) {
    case "inventory":
      return items
        .filter(i => {
          if ( !["weapon", "equipment", "consumable", "tool", "loot", "container"].includes(i.type) ) return false;
          if ( ["weapon", "equipment"].includes(i.type) ) return !!i.system.equipped;
          return true;
        })
        .sort((a, b) => ((INVENTORY_ORDER[a.type] ?? 9) - (INVENTORY_ORDER[b.type] ?? 9)) || byName(a, b));

    case "features":
      return items
        .filter(i => i.type === "feat")
        .sort((a, b) => {
          const oa = ACTIVATION_ORDER[primaryActivation(activationTypes(a))] ?? 9;
          const ob = ACTIVATION_ORDER[primaryActivation(activationTypes(b))] ?? 9;
          return (oa - ob) || byName(a, b);
        });

    case "spells":
      return items
        .filter(i => (i.type === "spell") && isCastable(i))
        .sort((a, b) => ((a.system.level ?? 0) - (b.system.level ?? 0)) || byName(a, b));

    default:
      return [];
  }
}

/** Passive features (nothing to activate), grouped by feature type then name. */
export function passiveCandidates(actor) {
  return actor.items
    .filter(i => (i.type === "feat") && !isActive(i))
    .sort((a, b) => ((FEATURE_ORDER[a.system.type?.value] ?? 9) - (FEATURE_ORDER[b.system.type?.value] ?? 9))
      || byName(a, b));
}
