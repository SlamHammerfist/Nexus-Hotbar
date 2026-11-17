/**
 * Stat column: boxes to the left of the portrait, laid out like the loadout.
 * Each box shows one stat picked per actor; clicking a rollable stat rolls it. Which stats exist
 * and how to read them comes from the system module (`stats` in registerSystem); with none,
 * the column doesn't show.
 *
 * Choices are stored per actor in actor.flags["nexus-hotbar"].bar.stats = [key, key, key].
 */

import { MODULE } from "./constants.mjs";
import { activeSystem } from "./system.mjs";

/** The system's stat source, or null. */
function source() {
  return activeSystem()?.stats ?? null;
}

/** How many boxes the column has. */
export function statCount() {
  return Math.clamp(Number(source()?.count) || 3, 1, 6);
}

/* -------------------------------------------- */
/*  Storage                                     */
/* -------------------------------------------- */

export function readStats(actor) {
  const saved = actor?.getFlag(MODULE, "bar")?.stats;
  const keys = Array.isArray(saved) ? saved : (source()?.defaults ?? []);
  return Array.from({ length: statCount() }, (_, i) => keys[i] ?? null);
}

export async function writeStats(actor, keys) {
  const stats = Array.from({ length: statCount() }, (_, i) => keys[i] || null);
  await actor.update({ [`flags.${MODULE}.bar.stats`]: stats });
}

/* -------------------------------------------- */
/*  Options and reading                         */
/* -------------------------------------------- */

/**
 * Every stat the actor has, for the pickers.
 * @returns {{key: string, label: string, group: string}[]}
 */
export function statOptions(actor) {
  if ( !actor ) return [];
  return source()?.options?.(actor) ?? [];
}

/**
 * Current value of one stat.
 * @returns {{label: string, short: string, icon: string, value: string, tooltip?: string,
 *            roll?: Function}|null}
 */
export function readStat(actor, key) {
  if ( !actor || !key ) return null;
  return source()?.read?.(actor, key) ?? null;
}

/** Context for the column, or null with no actor. */
export function prepareStats(actor) {
  if ( !actor || !source() ) return null;
  return readStats(actor).map((key, index) => {
    const stat = readStat(actor, key);
    if ( !stat ) {
      return { index, cssClass: "open", icon: "fa-solid fa-plus", tooltip: "Empty: click to choose a stat" };
    }
    return {
      index,
      cssClass: stat.roll ? "filled rollable" : "filled",
      icon: stat.icon,
      value: stat.value,
      short: stat.short,
      tooltip: stat.tooltip ?? stat.label
    };
  });
}

/* -------------------------------------------- */
/*  Choosing                                    */
/* -------------------------------------------- */

/** Pick what a box shows. */
async function chooseStat(bar, index) {
  const actor = bar.actor;
  if ( !actor ) return;
  const options = statOptions(actor);
  const current = readStats(actor)[index];
  const esc = Handlebars.escapeExpression;

  let opts = "";
  let group = null;
  for ( const opt of options ) {
    if ( opt.group !== group ) {
      if ( group ) opts += `</optgroup>`;
      group = opt.group;
      opts += `<optgroup label="${esc(group)}">`;
    }
    const value = readStat(actor, opt.key)?.value ?? "";
    opts += `<option value="${esc(opt.key)}" ${opt.key === current ? "selected" : ""}>`
      + `${esc(opt.label)}${value ? ` (${esc(value)})` : ""}</option>`;
  }
  if ( group ) opts += `</optgroup>`;

  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `Stat Box ${index + 1}: ${actor.name}`, icon: "fa-solid fa-chart-simple" },
    position: { width: 340 },
    content: `<div class="form-group"><label>Show</label>
      <div class="form-fields"><select name="stat">${opts}</select></div></div>`,
    buttons: [
      {
        action: "save",
        label: "Show",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => button.form.elements.stat.value
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !picked || (picked === "cancel") ) return;
  const keys = readStats(actor);
  keys[index] = picked;
  await writeStats(actor, keys);
}

async function clearStat(bar, index) {
  const actor = bar.actor;
  const keys = readStats(actor);
  keys[index] = null;
  await writeStats(actor, keys);
}

/* -------------------------------------------- */
/*  Right-click menu and click                  */
/* -------------------------------------------- */

export function statMenuOptions(bar) {
  const statFor = li => readStat(bar.actor, readStats(bar.actor)[Number(li.dataset.index)]);
  return [
    {
      label: "Roll",
      icon: "fa-solid fa-dice-d20",
      visible: li => !!statFor(li)?.roll,
      onClick: (event, li) => statFor(li)?.roll(event)
    },
    {
      label: "Choose Stat...",
      icon: "fa-solid fa-list-check",
      visible: () => !!bar.actor,
      onClick: (event, li) => chooseStat(bar, Number(li.dataset.index))
    },
    {
      label: "Clear",
      icon: "fa-solid fa-xmark",
      visible: li => !!readStats(bar.actor)[Number(li.dataset.index)],
      onClick: (event, li) => clearStat(bar, Number(li.dataset.index))
    }
  ];
}

/** Click a box: roll it if it's rollable, or pick a stat if it's empty. @this {NexusHotbar} */
export async function onStatClick(event, target) {
  const actor = this.actor;
  const index = Number(target.dataset.index);
  const stat = readStat(actor, readStats(actor)[index]);
  if ( !stat ) return chooseStat(this, index);
  return stat.roll?.(event);
}
