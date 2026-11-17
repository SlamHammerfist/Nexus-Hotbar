/**
 * Passive features frame: the shield button opens a chooser dialog, chosen features show as
 * icons. Click shows one (posts it to chat); right-click for more. Stored per actor in
 * actor.flags["nexus-hotbar"].bar.passives = ["Item.<id>", ...].
 *
 * Supplied by the system module (`passives` in registerSystem); with none, the frame doesn't show.
 *   passives: {
 *     label               name in the show / hide list (default "Passive Features")
 *     candidates(actor)   -> Item[] to offer in the chooser, in order
 *     group(item)         -> heading the item is listed under in the chooser
 *     show(item, event)   click a passive (default: open its sheet)
 *   }
 */

import { MODULE } from "./constants.mjs";
import { activeSystem, tooltipAttributes } from "./system.mjs";
import { resolveEntry } from "./slots.mjs";

function source() {
  return activeSystem()?.passives ?? null;
}

/** Show a passive: the system's way (e.g. post to chat), else open its sheet. */
function showPassive(item, event) {
  if ( !item ) return;
  const show = source()?.show;
  if ( show ) return show(item, event);
  return item.sheet?.render({ force: true });
}

/* -------------------------------------------- */
/*  Storage                                     */
/* -------------------------------------------- */

export function readPassives(actor) {
  return Array.from(actor?.getFlag(MODULE, "bar")?.passives ?? []);
}

async function writePassives(bar, actor, passives) {
  await actor.update({ [`flags.${MODULE}.bar.passives`]: passives.filter(Boolean) });
  bar.refresh();
}

/** Context for the passives frame, or null with no actor. */
export function preparePassives(actor) {
  if ( !actor || !source() ) return null;
  return readPassives(actor)
    .map(e => resolveEntry(e, actor))
    .filter(Boolean)
    .map(i => ({ id: i.id, uuid: i.uuid, name: i.name, img: i.img }));
}

/* -------------------------------------------- */
/*  Right-click menu                            */
/* -------------------------------------------- */

export function passiveMenuOptions(bar) {
  const itemFor = li => (li.dataset.id ? bar.actor?.items.get(li.dataset.id) : null);
  return [
    {
      label: "Show in Chat",
      icon: "fa-solid fa-comment",
      visible: li => !!source()?.show && !!itemFor(li),
      onClick: (event, li) => showPassive(itemFor(li), event)
    },
    {
      label: "Open Sheet",
      icon: "fa-solid fa-file-lines",
      visible: li => !!itemFor(li),
      onClick: (event, li) => itemFor(li)?.sheet.render({ force: true })
    },
    {
      label: "Remove from Passives",
      icon: "fa-solid fa-xmark",
      visible: li => !!itemFor(li),
      onClick: (event, li) => removePassive(bar, li.dataset.id)
    },
    {
      label: "Choose Passives...",
      icon: "fa-solid fa-list-check",
      visible: () => !!bar.actor,
      onClick: () => choosePassives(bar)
    },
    {
      label: "Clear Passives",
      icon: "fa-solid fa-trash",
      visible: () => readPassives(bar.actor).length > 0,
      onClick: () => clearPassives(bar)
    }
  ];
}

/* -------------------------------------------- */
/*  Chooser dialog                              */
/* -------------------------------------------- */

/** Open a checklist of the actor's passive features and show the ones picked. */
export async function choosePassives(bar) {
  if ( bar.guardLocked() ) return;
  const actor = bar.actor;
  if ( !actor ) return;

  const current = readPassives(actor);
  const chosen = new Set(current);
  const items = Array.from(source()?.candidates?.(actor) ?? []);
  for ( const entry of current ) {
    const item = resolveEntry(entry, actor);
    if ( item && !items.includes(item) ) items.push(item);
  }
  if ( !items.length ) return ui.notifications.info(`${actor.name} has no passive features.`);

  // Group by the system's heading (e.g. feature type)
  const esc = Handlebars.escapeExpression;
  const groupOf = source()?.group;
  const groups = new Map();
  for ( const item of items ) {
    const heading = groupOf?.(item) || "Features";
    if ( !groups.has(heading) ) groups.set(heading, []);
    groups.get(heading).push(item);
  }

  let content = `<div class="nex-choose-list">`;
  for ( const [heading, list] of groups ) {
    content += `<h4>${esc(heading)}</h4>`;
    for ( const item of list ) {
      const entry = `Item.${item.id}`;
      content += `<label class="nex-choose-row" ${tooltipAttributes(item)}>
        <input type="checkbox" name="passive" value="${entry}" ${chosen.has(entry) ? "checked" : ""}>
        <img src="${esc(item.img)}" alt="">
        <span>${esc(item.name)}</span>
      </label>`;
    }
  }
  content += `</div>`;

  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `Passive Features: ${actor.name}`, icon: "fa-solid fa-shield-halved" },
    classes: ["nexus-choose-dialog"],
    position: { width: 380 },
    content,
    buttons: [
      {
        action: "save",
        label: "Save",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => Array.from(
          button.form.querySelectorAll('input[name="passive"]:checked'), i => i.value)
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !Array.isArray(picked) ) return;

  // Keep the existing order, then add new picks in list order
  const keep = new Set(picked);
  const next = current.filter(e => keep.has(e)).concat(picked.filter(e => !chosen.has(e)));
  return writePassives(bar, actor, next);
}

export async function removePassive(bar, id) {
  if ( bar.guardLocked() ) return;
  const actor = bar.actor;
  if ( !actor ) return;
  return writePassives(bar, actor, readPassives(actor).filter(e => e !== `Item.${id}`));
}

export async function clearPassives(bar) {
  if ( bar.guardLocked() ) return;
  const actor = bar.actor;
  if ( !actor ) return;
  return writePassives(bar, actor, []);
}

/* -------------------------------------------- */
/*  Actions and drop                            */
/* -------------------------------------------- */

/** Click a passive: show it (post its description to chat). @this {NexusHotbar} */
export async function onPassive(event, target) {
  const item = target.dataset.id ? this.actor?.items.get(target.dataset.id) : null;
  return showPassive(item, event);
}

/** Shield button. @this {NexusHotbar} */
export async function onChoosePassives() {
  return choosePassives(this);
}

/** Drop a feature onto the passives frame. */
export async function onDropPassive(bar, event) {
  if ( bar.guardLocked() ) return;
  const actor = bar.actor;
  if ( !actor ) return;
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if ( data.type !== "Item" ) return;
  const item = await Item.implementation.fromDropData(data);
  if ( !item ) return;
  if ( item.parent?.uuid !== actor.uuid ) {
    return ui.notifications.warn(`${item.name} isn't owned by ${actor.name}. Add it to their sheet first.`);
  }
  const entry = `Item.${item.id}`;
  const passives = readPassives(actor);
  if ( passives.includes(entry) ) return;
  return writePassives(bar, actor, passives.concat(entry));
}
