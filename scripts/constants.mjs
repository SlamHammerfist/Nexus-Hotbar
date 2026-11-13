/**
 * Shared constants for Nexus Hotbar.
 */

export const MODULE = "nexus-hotbar";

/** Layout used until it's changed in the settings dialog. */
export const LAYOUT_DEFAULTS = { columns: 10, slotSize: 50 };

/** Parts of the bar that can be shown or hidden (gear dialog), in display order. All shown by default. */
export const SECTIONS = {
  stats: "Stat Boxes",
  portrait: "Portrait & Health",
  loadout: "Weapon Loadout",
  passives: "Passive Features",
  highlights: "Action / Bonus / Reaction Filter",
  effects: "Active Effects",
  controls: "Rest & Combat Buttons"
};

/** Most rows a tab can have. */
export const MAX_ROWS = 6;

/** The three tabs shown for an actor. */
export const TABS = {
  inventory: { label: "Inventory", icon: "fa-solid fa-sack" },
  features: { label: "Features", icon: "fa-solid fa-hand-fist" },
  spells: { label: "Spells", icon: "fa-solid fa-wand-sparkles" }
};

/** Activation types that can be highlighted, in display order. */
export const ACTIVATIONS = {
  action: { label: "Action", icon: "fa-solid fa-circle" },
  bonus: { label: "Bonus Action", icon: "fa-solid fa-triangle" },
  reaction: { label: "Reaction", icon: "fa-solid fa-arrows-rotate" }
};

/** CSS class and options for dnd5e's rich item tooltip. */
export const ITEM_TOOLTIP_CLASS = "dnd5e2 dnd5e-tooltip item-tooltip document-tooltip";
