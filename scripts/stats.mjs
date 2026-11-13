/**
 * Stat column: three boxes to the left of the portrait, laid out like the loadout.
 * Each box shows one stat picked per actor: AC, speed, initiative, proficiency, spell save DC,
 * passive scores, any skill, ability check or saving throw. Clicking a rollable stat rolls it.
 *
 * Choices are stored per actor in actor.flags["nexus-hotbar"].bar.stats = [key, key, key].
 * Keys: "ac", "speed", "init", "prof", "spelldc", "passive:<skill>",
 *       "skill:<skill>", "check:<ability>", "save:<ability>".
 */

import { MODULE } from "./constants.mjs";

export const STAT_COUNT = 3;

/** Shown until the player picks their own. */
const DEFAULT_STATS = ["ac", "speed", "init"];

const signed = n => (Number(n) >= 0 ? `+${Number(n)}` : String(Number(n)));
const loc = label => (label ? _loc(label) : "");

/* -------------------------------------------- */
/*  Storage                                     */
/* -------------------------------------------- */

export function readStats(actor) {
  const saved = actor?.getFlag(MODULE, "bar")?.stats;
  const keys = Array.isArray(saved) ? saved : DEFAULT_STATS;
  return Array.from({ length: STAT_COUNT }, (_, i) => keys[i] ?? null);
}

export async function writeStats(actor, keys) {
  const stats = Array.from({ length: STAT_COUNT }, (_, i) => keys[i] || null);
  await actor.update({ [`flags.${MODULE}.bar.stats`]: stats });
}

/* -------------------------------------------- */
/*  Options                                     */
/* -------------------------------------------- */

/**
 * Every stat the actor has, for the pickers.
 * @returns {{key: string, label: string, group: string}[]}
 */
export function statOptions(actor) {
  if ( !actor ) return [];
  const sys = actor.system;
  const options = [];
  const add = (group, key, label) => options.push({ key, label, group });

  add("Combat", "ac", "Armor Class");
  if ( sys.attributes?.movement ) add("Combat", "speed", "Speed");
  if ( sys.attributes?.init ) add("Combat", "init", "Initiative");
  if ( sys.attributes?.prof !== undefined ) add("Combat", "prof", "Proficiency Bonus");
  if ( sys.attributes?.spell?.dc ) add("Combat", "spelldc", "Spell Save DC");

  const skills = Object.entries(CONFIG.DND5E?.skills ?? {})
    .filter(([key]) => sys.skills?.[key])
    .map(([key, cfg]) => [key, loc(cfg.label)])
    .sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang));
  for ( const key of ["prc", "ins", "inv"] ) {
    const label = skills.find(([k]) => k === key)?.[1];
    if ( label ) add("Passive Scores", `passive:${key}`, `Passive ${label}`);
  }
  for ( const [key, label] of skills ) add("Skills", `skill:${key}`, label);

  for ( const [key, cfg] of Object.entries(CONFIG.DND5E?.abilities ?? {}) ) {
    if ( sys.abilities?.[key] ) add("Ability Checks", `check:${key}`, `${loc(cfg.label)} Check`);
  }
  for ( const [key, cfg] of Object.entries(CONFIG.DND5E?.abilities ?? {}) ) {
    if ( sys.abilities?.[key] ) add("Saving Throws", `save:${key}`, `${loc(cfg.label)} Save`);
  }
  return options;
}

/* -------------------------------------------- */
/*  Reading a stat                              */
/* -------------------------------------------- */

/**
 * Current value of one stat.
 * @returns {{label: string, short: string, icon: string, value: string, tooltip: string,
 *            roll?: Function}|null}
 */
export function readStat(actor, key) {
  if ( !actor || !key ) return null;
  const sys = actor.system;
  const attrs = sys.attributes ?? {};
  const [kind, id] = key.split(":");

  switch ( kind ) {
    case "ac": {
      const ac = attrs.ac?.value;
      if ( ac === undefined ) return null;
      return { label: "Armor Class", short: "AC", icon: "fa-solid fa-shield-halved", value: String(ac) };
    }

    case "speed": {
      const move = attrs.movement;
      if ( !move ) return null;
      const units = move.units || "ft";
      const types = Object.entries(CONFIG.DND5E?.movementTypes ?? { walk: "Walk" })
        .filter(([t]) => Number(move[t]) > 0)
        .map(([t, cfg]) => `${loc(cfg?.label ?? cfg)} ${move[t]} ${units}`);
      return { label: "Speed", short: units.toUpperCase(), icon: "fa-solid fa-person-running",
        value: String(Number(move.walk) || 0),
        tooltip: types.length ? `Speed: ${types.join(", ")}` : "Speed" };
    }

    case "init": {
      if ( !attrs.init ) return null;
      return { label: "Initiative", short: "INIT", icon: "fa-solid fa-bolt", value: signed(attrs.init.total ?? 0),
        tooltip: "Initiative: click to roll", roll: event => actor.rollInitiativeDialog({ event }) };
    }

    case "prof": {
      if ( attrs.prof === undefined ) return null;
      return { label: "Proficiency Bonus", short: "PROF", icon: "fa-solid fa-graduation-cap",
        value: signed(attrs.prof) };
    }

    case "spelldc": {
      const dc = attrs.spell?.dc;
      if ( !dc ) return null;
      return { label: "Spell Save DC", short: "DC", icon: "fa-solid fa-wand-sparkles", value: String(dc) };
    }

    case "passive": {
      const skill = sys.skills?.[id];
      if ( !skill ) return null;
      const name = loc(CONFIG.DND5E.skills[id]?.label);
      return { label: `Passive ${name}`, short: `P.${id.toUpperCase()}`, icon: "fa-solid fa-eye",
        value: String(skill.passive ?? (10 + (skill.total ?? 0))),
        tooltip: `Passive ${name}: click to roll ${name}`,
        roll: event => actor.rollSkill({ skill: id, event }) };
    }

    case "skill": {
      const skill = sys.skills?.[id];
      if ( !skill ) return null;
      const name = loc(CONFIG.DND5E.skills[id]?.label);
      return { label: name, short: id.toUpperCase(), icon: "fa-solid fa-dice-d20", value: signed(skill.total ?? 0),
        tooltip: `${name}: click to roll`, roll: event => actor.rollSkill({ skill: id, event }) };
    }

    case "check": {
      const ability = sys.abilities?.[id];
      if ( !ability ) return null;
      const name = loc(CONFIG.DND5E.abilities[id]?.label);
      return { label: `${name} Check`, short: id.toUpperCase(), icon: "fa-solid fa-dice-d20",
        value: signed(ability.mod ?? 0), tooltip: `${name} ${ability.value ?? ""}: click to roll a check`,
        roll: event => actor.rollAbilityCheck({ ability: id, event }) };
    }

    case "save": {
      const ability = sys.abilities?.[id];
      if ( !ability ) return null;
      const name = loc(CONFIG.DND5E.abilities[id]?.label);
      const save = typeof ability.save === "object" ? ability.save?.value : ability.save;
      return { label: `${name} Save`, short: `${id.toUpperCase()} SV`, icon: "fa-solid fa-shield",
        value: signed(save ?? ability.mod ?? 0), tooltip: `${name} Save: click to roll`,
        roll: event => actor.rollSavingThrow({ ability: id, event }) };
    }
  }
  return null;
}

/** Context for the column, or null with no actor. */
export function prepareStats(actor) {
  if ( !actor ) return null;
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
