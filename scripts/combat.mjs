/**
 * Combat controls (Roll Initiative / hourglass / End Turn), the rest buttons they replace,
 * and the your-turn alert. Rest buttons and the initiative roll come from the system module
 * (`rests` and `rollInitiative` in registerSystem).
 */

import { MODULE } from "./constants.mjs";
import { activeSystem } from "./system.mjs";

/**
 * Your-turn alert. Runs on every client when combat changes turn; only players who own the
 * actor whose turn it is get the alert (the GM owns everything, so is skipped).
 * @param {Combat} combat
 * @param {object} changes
 */
export function alertTurn(combat, changes) {
  if ( game.user.isGM || !combat.started ) return;
  if ( !("turn" in changes) && !("round" in changes) ) return;
  const combatant = combat.combatant;
  const actor = combatant?.actor;
  if ( !actor?.isOwner || combatant.isDefeated ) return;

  const mode = game.settings.get(MODULE, "turnAlert");
  if ( mode === "off" ) return;
  if ( (mode === "sound") || (mode === "both") ) {
    foundry.audio.AudioHelper.play({ src: "sounds/notify.wav", volume: 0.8, autoplay: true, loop: false }, false);
  }
  if ( ((mode === "flash") || (mode === "both")) && ui.hotbar ) {
    // The bar re-renders for the turn change too, so _onRender re-applies this until it runs out
    ui.hotbar.flashUntil = Date.now() + 2500;
    applyTurnFlash(ui.hotbar);
  }
  ui.hotbar?.wake?.(); // un-fade the bar so it's ready to use
  ui.notifications.info(`It's ${actor.name}'s turn!`);
}

/** Add the flash class while a your-turn alert is running. Called from the alert and each render. */
export function applyTurnFlash(bar) {
  const el = bar.element;
  const remaining = (bar.flashUntil ?? 0) - Date.now();
  if ( !el || (remaining <= 0) ) return;
  el.classList.add("nex-your-turn");
  clearTimeout(bar._flashTimer);
  bar._flashTimer = setTimeout(() => bar.element?.classList.remove("nex-your-turn"), remaining);
}

/** The actor's combatant in the current combat, if any. */
export function getCombatant(actor) {
  if ( !actor ) return null;
  return game.combat?.combatants.find(c => c.actor?.uuid === actor.uuid) ?? null;
}

/**
 * Combat controls state: "roll" until initiative is rolled, "wait" until it's the actor's turn,
 * then "turn". Null when the actor isn't in combat (the rest buttons show instead).
 */
export function prepareCombat(actor) {
  const combatant = getCombatant(actor);
  if ( !combatant ) return null;
  const combat = combatant.combat;
  if ( combatant.initiative === null ) return { state: "roll" };
  if ( !combat.started ) return { state: "wait", tooltip: "Waiting for combat to start" };
  if ( combat.combatant?.id === combatant.id ) return { state: "turn" };
  return { state: "wait", tooltip: "Waiting for your turn" };
}

/** Rest buttons the system supplies, for the template. */
export function prepareRests() {
  return (activeSystem()?.rests ?? []).map(({ id, label, icon }) => ({ id, label, icon }));
}

/** Click a rest button. @this {NexusHotbar} */
export async function onRest(event, target) {
  const actor = this.actor;
  if ( !actor ) return;
  const rest = (activeSystem()?.rests ?? []).find(r => r.id === target.dataset.rest);
  return rest?.run?.(actor, event);
}

/** Roll initiative: the system's way (e.g. a dialog for bonuses), else the core roll. @this {NexusHotbar} */
export async function onInitiative(event) {
  const actor = this.actor;
  const combatant = getCombatant(actor);
  if ( !combatant ) return;
  const roll = activeSystem()?.rollInitiative;
  if ( roll ) return roll(actor, combatant, event);
  return combatant.combat.rollInitiative([combatant.id]);
}

/** End the actor's turn. @this {NexusHotbar} */
export async function onEndTurn() {
  const combatant = getCombatant(this.actor);
  const combat = combatant?.combat;
  if ( !combat || (combat.combatant?.id !== combatant.id) ) return;
  return combat.nextTurn();
}
