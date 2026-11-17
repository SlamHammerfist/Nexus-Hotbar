/**
 * The system registry and the public API. Nexus Hotbar works with any game system; a system
 * module fills in the parts that need to know about the system's data (which tabs there are,
 * what auto-fill picks, uses and charges, hit points, stats, rests...).
 *
 *   Hooks.once("nexusHotbar.ready", api => api.registerSystem({ id: "mysystem", ... }));
 *
 * Every part except `id` is optional. Only the registration whose id matches game.system.id is
 * used. With none, the bar shows one "Items" tab of the actor's items, the macro grid, active
 * effects, combat controls and the portrait image.
 */

import { MODULE } from "./constants.mjs";

/**
 * @typedef {object} TabConfig
 * @property {string} label
 * @property {string} [icon]     Font Awesome classes, e.g. "fa-solid fa-book".
 * @property {string} [img]      Image path, drawn as a mask in the text colour.
 * @property {string} [html]     Icon markup, used as-is instead of icon / img.
 * @property {boolean} [default] The tab a bar opens on before one has been picked.
 */

/**
 * @typedef {object} SystemConfig
 * @property {string} id
 * @property {Record<string, TabConfig>} [tabs]
 * @property {{types: Record<string, {label: string, icon: string, color?: string}>,
 *             of: (item: Item) => Iterable<string>}} [activations]
 * @property {(actor: Actor, tab: string) => Item[]} [autoFill]
 * @property {(item: Item) => {level?: string, count?: string, depleted?: boolean}} [slotInfo]
 * @property {(item: Item, event?: Event) => any} [use]
 * @property {(item: Item) => {html: string, cssClass?: string}|null} [tooltip]
 * @property {object} [passives]
 * @property {object} [loadout]
 * @property {object} [portrait]
 * @property {object} [stats]
 * @property {{id: string, label: string, icon: string, run: (actor: Actor) => any}[]} [rests]
 * @property {(actor: Actor, combatant: Combatant, event?: Event) => any} [rollInitiative]
 */

/** @type {Map<string, SystemConfig>} */
const systems = new Map();

/** Tabs used when no system module is active. */
const GENERIC_TABS = { items: { label: "Items", icon: "fa-solid fa-suitcase" } };

const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang);

/* -------------------------------------------- */
/*  Reading the active system                   */
/* -------------------------------------------- */

/** The registration for the running game system, or null. */
export function activeSystem() {
  return systems.get(game.system?.id) ?? null;
}

/** The actor tabs, in display order. */
export function getTabs() {
  const tabs = activeSystem()?.tabs;
  return (tabs && Object.keys(tabs).length) ? tabs : GENERIC_TABS;
}

/** The tab a bar opens on before one has been picked. */
export function defaultTab() {
  const tabs = getTabs();
  return Object.keys(tabs).find(id => tabs[id].default) ?? Object.keys(tabs)[0];
}

/** Activation types that can be highlighted, in display order. */
export function getActivations() {
  return activeSystem()?.activations?.types ?? {};
}

/** The set of activation types an item has. */
export function activationTypes(item) {
  const of = activeSystem()?.activations?.of;
  return new Set(of ? (of(item) ?? []) : []);
}

/** The first highlightable activation type the item uses, or null. */
export function primaryActivation(types) {
  return Object.keys(getActivations()).find(t => types.has(t)) ?? null;
}

/** Items that belong on a tab when auto-filling, in display order. */
export function autoFillCandidates(actor, tab) {
  const autoFill = activeSystem()?.autoFill;
  if ( autoFill ) return autoFill(actor, tab) ?? [];
  return actor.items.contents.sort(byName);
}

/** Badges and state for an item in a slot. */
export function slotInfo(item) {
  return activeSystem()?.slotInfo?.(item) ?? {};
}

/** Rich tooltip for an item, or null to use its name. */
export function itemTooltip(item) {
  if ( !item ) return null;
  return activeSystem()?.tooltip?.(item) ?? null;
}

/**
 * Tooltip attributes for an item in a dialog list: the system's rich tooltip, else the name.
 * @param {Item} item
 * @param {string} [direction="RIGHT"]
 */
export function tooltipAttributes(item, direction="RIGHT") {
  const esc = Handlebars.escapeExpression;
  const tip = itemTooltip(item);
  if ( !tip?.html ) return `data-tooltip-text="${esc(item.name)}"`;
  return `data-tooltip-html="${esc(tip.html)}" data-tooltip-class="${esc(tip.cssClass ?? "")}"
    data-tooltip-direction="${direction}"`;
}

/** Use an item (the system's way, else its use() method, else its sheet) or run a macro. */
export async function useDocument(doc, event) {
  if ( !doc ) return;
  if ( doc.documentName === "Macro" ) return doc.execute();
  const use = activeSystem()?.use;
  if ( use ) return use(doc, event);
  if ( typeof doc.use === "function" ) return doc.use({ event });
  return doc.sheet?.render({ force: true });
}

/** Parts of the bar that can be shown or hidden, in display order, for what the system supplies. */
export function availableSections() {
  const system = activeSystem() ?? {};
  const sections = {};
  if ( system.stats ) sections.stats = "Stat Boxes";
  sections.portrait = system.portrait ? "Portrait & Health" : "Portrait";
  if ( system.loadout ) sections.loadout = system.loadout.label ?? "Loadout";
  if ( system.passives ) sections.passives = system.passives.label ?? "Passive Features";
  const activations = Object.values(getActivations());
  if ( activations.length ) sections.highlights = `${activations.map(a => a.label).join(" / ")} Filter`;
  sections.effects = "Active Effects";
  sections.controls = system.rests?.length ? "Rest & Combat Buttons" : "Combat Buttons";
  return sections;
}

/** Options for which tab a bar opens on. */
export function startTabs() {
  const choices = { last: "Remember last tab" };
  for ( const [id, tab] of Object.entries(getTabs()) ) choices[id] = `Always ${tab.label}`;
  return choices;
}

/* -------------------------------------------- */
/*  API                                         */
/* -------------------------------------------- */

export const api = {
  /** Module id, also the flag scope the bar's layout is saved under. */
  MODULE,

  /**
   * Register a game system. Only the registration for the running system is used.
   * @param {SystemConfig} config
   */
  registerSystem(config) {
    if ( !config?.id ) throw new Error("Nexus Hotbar | registerSystem needs an id.");
    systems.set(config.id, config);
    if ( config.id === game.system?.id ) ui.hotbar?.refresh?.();
  },

  /** The registration for the running system, if any. */
  get system() {
    return activeSystem();
  },

  /** Use an item or run a macro, the same way clicking a slot does. */
  useDocument,

  /** Tooltip attributes for an item in a dialog list. */
  tooltipAttributes,

  /** Re-render the bar (debounced). */
  refresh() {
    ui.hotbar?.refresh?.();
  }
};
