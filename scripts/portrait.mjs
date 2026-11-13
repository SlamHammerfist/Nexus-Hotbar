/**
 * Token portrait, with a health bar along the bottom and death saves at 0 HP.
 * Click opens the sheet; right-click opens a dialog to roll checks, saves and skills.
 */

import { readStat } from "./stats.mjs";

/** The token art for the actor: the selected token's image, else the prototype token's, else the actor's. */
function portraitImage(actor) {
  const token = canvas?.tokens?.controlled?.find(t => t.actor === actor);
  const src = token?.document.texture.src ?? actor.prototypeToken?.texture.src;
  // Wildcard token images ("*") can't be shown directly
  if ( src && !src.includes("*") ) return src;
  return actor.img;
}

/** Context for the portrait, or null with no actor. */
export function preparePortrait(actor) {
  if ( !actor ) return null;
  const portrait = { name: actor.name, img: portraitImage(actor) };

  // Same pieces as the dnd5e character sheet's hit point meter
  const hp = actor.system.attributes?.hp;
  const max = Number(hp?.effectiveMax ?? hp?.max) || 0;
  if ( max > 0 ) {
    const value = Math.clamp(Number(hp.value) || 0, 0, max);
    const temp = Math.max(Number(hp.temp) || 0, 0);
    const tempmax = Number(hp.tempmax) || 0;
    portrait.hp = {
      value,
      max,
      temp,
      tempmax: tempmax ? (tempmax > 0 ? `+${tempmax}` : String(tempmax)) : "",
      tempmaxClass: tempmax > 0 ? "temp-positive" : tempmax < 0 ? "temp-negative" : "",
      pct: Math.round((value / max) * 100)
    };

    // Death saves at 0 HP (characters only)
    const death = actor.system.attributes?.death;
    if ( (value === 0) && death ) {
      const success = Math.clamp(Number(death.success) || 0, 0, 3);
      const failure = Math.clamp(Number(death.failure) || 0, 0, 3);
      portrait.death = {
        success: [0, 1, 2].map(i => i < success),
        failure: [0, 1, 2].map(i => i < failure),
        stable: success >= 3,
        dead: failure >= 3
      };
      portrait.cssClass = failure >= 3 ? "dead" : "dying";
    }
  }
  return portrait;
}

/**
 * Read an HP input the way the dnd5e sheet does: "+5" / "-5" adjust the current value,
 * "=5" or a plain number sets it.
 */
function parseHpInput(text, current) {
  const raw = String(text).trim();
  if ( !raw ) return 0;
  const n = Number(raw.replace(/^[=+-]/, ""));
  if ( !Number.isFinite(n) ) return null;
  if ( raw.startsWith("+") ) return current + n;
  if ( raw.startsWith("-") ) return current - n;
  return n;
}

/** Right-click the portrait: a dialog of ability checks, saving throws and skills to roll. */
async function openRollDialog(bar) {
  const actor = bar.actor;
  if ( !actor?.system.abilities ) return;
  const esc = Handlebars.escapeExpression;
  const button = (key, text, value, extra="") => {
    const stat = readStat(actor, key);
    if ( !stat ) return `<span></span>`;
    return `<button type="button" class="nex-roll-btn ${extra}" data-roll="${esc(key)}">
      <span class="nex-roll-name">${esc(text)}</span><span class="nex-roll-mod">${esc(value ?? stat.value)}</span>
    </button>`;
  };

  // Abilities: one row each with Check and Save
  let abilities = `<div class="nex-roll-abilities">
    <span></span><span class="nex-roll-head">Check</span><span class="nex-roll-head">Save</span>`;
  for ( const [key, cfg] of Object.entries(CONFIG.DND5E.abilities) ) {
    const ability = actor.system.abilities[key];
    if ( !ability ) continue;
    abilities += `<span class="nex-roll-ability" data-tooltip-text="${esc(_loc(cfg.label))} ${ability.value ?? ""}">
      ${esc(key.toUpperCase())}</span>
      ${button(`check:${key}`, "", null, "compact")}
      ${button(`save:${key}`, "", null, "compact")}`;
  }
  abilities += `</div>`;

  // Skills, alphabetical
  const skills = Object.entries(CONFIG.DND5E.skills)
    .filter(([key]) => actor.system.skills?.[key])
    .map(([key, cfg]) => [key, _loc(cfg.label)])
    .sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang));
  let skillHtml = `<div class="nex-roll-skills">`;
  for ( const [key, label] of skills ) {
    const prof = Number(actor.system.skills[key].value) || 0;
    skillHtml += button(`skill:${key}`, label, null, prof ? "proficient" : "");
  }
  skillHtml += `</div>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: `Roll: ${actor.name}`, icon: "fa-solid fa-dice-d20" },
    classes: ["nexus-roll-dialog"],
    position: { width: 420 },
    content: `<h4>Ability Checks &amp; Saving Throws</h4>${abilities}<h4>Skills</h4>${skillHtml}`,
    buttons: [{ action: "close", label: "Close", icon: "fa-solid fa-xmark" }],
    rejectClose: false,
    render: (event, dialog) => {
      dialog.element.querySelectorAll("[data-roll]").forEach(btn => btn.addEventListener("click", ev => {
        ev.preventDefault();
        const stat = readStat(actor, btn.dataset.roll);
        dialog.close();
        stat?.roll?.(ev);
      }));
    }
  });
}

/** Wire up the portrait's right-click roll dialog and the editable HP / temp HP boxes. Called each render. */
export function activatePortrait(bar) {
  bar.element.querySelector(".nex-portrait")?.addEventListener("contextmenu", event => {
    if ( event.target.closest(".nex-hp") ) return; // let the HP inputs keep their normal menu
    event.preventDefault();
    event.stopPropagation();
    openRollDialog(bar);
  });

  const meter = bar.element.querySelector(".nex-hp");
  if ( !meter ) return;

  // Clicks inside the meter edit it instead of opening the sheet
  meter.addEventListener("click", event => event.stopPropagation());

  const hpBar = meter.querySelector(".nex-hp-bar");
  const hpInput = hpBar.querySelector("input[name=hp]");
  const tempInput = meter.querySelector("input[name=temp]");

  // HP: show the number as "value / max"; click to swap in the input, like the sheet
  hpBar.addEventListener("click", () => {
    hpBar.classList.add("editing");
    hpInput.hidden = false;
    hpInput.focus();
    hpInput.select();
  });

  for ( const input of [hpInput, tempInput] ) {
    input.addEventListener("focus", () => input.select());
    input.addEventListener("keydown", event => {
      if ( event.key === "Enter" ) input.blur();
      else if ( event.key === "Escape" ) {
        input.value = input.defaultValue;
        input.blur();
      }
      event.stopPropagation(); // keep Foundry's keybindings (1-0, Delete...) out of the box
    });
    input.addEventListener("change", () => commit(bar, input));
    input.addEventListener("blur", () => {
      if ( input === hpInput ) {
        hpBar.classList.remove("editing");
        hpInput.hidden = true;
      }
    });
  }
}

async function commit(bar, input) {
  const actor = bar.actor;
  const hp = actor?.system.attributes?.hp;
  if ( !hp || !actor.isOwner ) return;

  if ( input.name === "hp" ) {
    const max = Number(hp.effectiveMax ?? hp.max) || 0;
    const current = Number(hp.value) || 0;
    const raw = input.value.trim();
    const value = raw ? parseHpInput(raw, current) : null;
    if ( value === null ) return (input.value = input.defaultValue);

    // Damage typed as "-5" comes out of temp HP first, then real HP
    const temp = Number(hp.temp) || 0;
    if ( raw.startsWith("-") && (temp > 0) ) {
      const damage = Math.max(current - Math.round(value), 0);
      const fromTemp = Math.min(temp, damage);
      return actor.update({
        "system.attributes.hp.temp": (temp - fromTemp) || null,
        "system.attributes.hp.value": Math.clamp(current - (damage - fromTemp), 0, max)
      });
    }
    return actor.update({ "system.attributes.hp.value": Math.clamp(Math.round(value), 0, max) });
  }

  const temp = parseHpInput(input.value, Number(hp.temp) || 0);
  if ( temp === null ) return (input.value = input.defaultValue);
  return actor.update({ "system.attributes.hp.temp": Math.max(Math.round(temp), 0) || null });
}

/** Roll a death saving throw (dnd5e handles the results). @this {NexusHotbar} */
export async function onDeathRoll(event) {
  return this.actor?.rollDeathSave?.({ event });
}

/**
 * Click a success / failure pip to set the count by hand.
 * Clicking the last filled pip clears it. @this {NexusHotbar}
 */
export async function onDeathPip(event, target) {
  const actor = this.actor;
  const death = actor?.system.attributes?.death;
  if ( !death || !actor.isOwner ) return;
  const kind = target.dataset.kind;
  const index = Number(target.dataset.index);
  const current = Number(death[kind]) || 0;
  const next = current === index + 1 ? index : index + 1;
  return actor.update({ [`system.attributes.death.${kind}`]: next });
}

/** Click the portrait: open the actor's sheet. @this {NexusHotbar} */
export async function onPortrait() {
  return this.actor?.sheet.render({ force: true });
}
