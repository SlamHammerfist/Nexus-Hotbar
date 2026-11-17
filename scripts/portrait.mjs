/**
 * Token portrait. Click opens the sheet. The system module can add a health bar along the
 * bottom, death saves, and a right-click action (`portrait` in registerSystem):
 *
 *   portrait: {
 *     prepare(actor)                   -> { hp?, death?, cssClass? }   extra context, see below
 *     setHp(actor, field, text)        field is "hp" or "temp"; return false if the text is invalid
 *     deathSave(actor, event)          roll a death save
 *     setDeathSave(actor, kind, index) click a "success" / "failure" pip
 *     roll(bar, event)                 right-click the portrait
 *     rollHint                         tooltip text for the right-click, e.g. "roll checks, saves, skills"
 *   }
 *   hp:    { value, max, temp, tempmax ("+5" or ""), tempmaxClass, pct }
 *   death: { success: [bool x3], failure: [bool x3], stable, dead }
 */

import { activeSystem } from "./system.mjs";

/** The system's portrait hooks, or an empty object. */
function hooks() {
  return activeSystem()?.portrait ?? {};
}

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
  const { prepare, roll, rollHint } = hooks();
  const portrait = { name: actor.name, img: portraitImage(actor) };
  if ( roll ) portrait.rollHint = rollHint || "more options";
  return Object.assign(portrait, prepare?.(actor) ?? {});
}

/** Wire up the portrait's right-click and the editable HP / temp HP boxes. Called each render. */
export function activatePortrait(bar) {
  const { roll } = hooks();
  if ( roll ) {
    bar.element.querySelector(".nex-portrait")?.addEventListener("contextmenu", event => {
      if ( event.target.closest(".nex-hp") ) return; // let the HP inputs keep their normal menu
      event.preventDefault();
      event.stopPropagation();
      roll(bar, event);
    });
  }

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
    if ( !input ) continue;
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
  const setHp = hooks().setHp;
  if ( !actor?.isOwner || !setHp ) return;
  const result = await setHp(actor, input.name, input.value);
  if ( result === false ) input.value = input.defaultValue;
}

/** Roll a death saving throw. @this {NexusHotbar} */
export async function onDeathRoll(event) {
  const actor = this.actor;
  if ( actor ) return hooks().deathSave?.(actor, event);
}

/** Click a success / failure pip to set the count by hand. @this {NexusHotbar} */
export async function onDeathPip(event, target) {
  const actor = this.actor;
  if ( !actor?.isOwner ) return;
  return hooks().setDeathSave?.(actor, target.dataset.kind, Number(target.dataset.index));
}

/** Click the portrait: open the actor's sheet. @this {NexusHotbar} */
export async function onPortrait() {
  return this.actor?.sheet.render({ force: true });
}
