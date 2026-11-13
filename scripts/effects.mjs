/**
 * Active conditions and timed effects shown in the header. Right-click removes one
 * (with a confirmation first if that's turned on in the gear dialog).
 */

/** Conditions (status effects) and effects with a duration that are active on the actor. */
export function prepareEffects(actor) {
  if ( !actor ) return [];
  const effects = [];
  for ( const effect of actor.allApplicableEffects() ) {
    if ( !effect.active ) continue;
    if ( !effect.isTemporary && !effect.statuses?.size ) continue;
    effects.push({ uuid: effect.uuid, name: effect.name, img: effect.img || "icons/svg/aura.svg" });
  }
  return effects;
}

/** Wire up right-click-to-remove on the effects frame. Called each render. */
export function activateEffects(bar) {
  bar.element.querySelector(".nex-effects")?.addEventListener("contextmenu", async event => {
    const el = event.target.closest(".nex-effect");
    if ( !el ) return;
    event.preventDefault();
    event.stopPropagation();
    const effect = await fromUuid(el.dataset.uuid);
    if ( !effect?.isOwner ) return;
    if ( bar.confirmEffectRemoval ) {
      const esc = Handlebars.escapeExpression;
      const proceed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Remove Effect", icon: "fa-solid fa-xmark" },
        content: `<p>Remove <strong>${esc(effect.name)}</strong> from ${esc(bar.actor?.name ?? "the actor")}?</p>`,
        modal: true
      });
      if ( !proceed ) return;
    }
    await effect.delete();
    ui.notifications.info(`Removed ${effect.name} from ${bar.actor?.name ?? "the actor"}.`);
  });
}
