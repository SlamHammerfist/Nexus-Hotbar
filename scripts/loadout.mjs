/**
 * Weapon loadout: a column of three boxes on the left of the bar.
 *   top / middle  two equipped one-handed weapons, or one two-handed weapon filling both;
 *                 an equipped shield always takes the middle (off hand) box
 *   bottom        the actor's Unarmed Strike, and nothing else
 *
 * What shows comes from what's actually equipped. Which weapon sits in the top or middle box
 * is remembered in actor.flags["nexus-hotbar"].bar.loadout = { top: "<itemId>", middle: "<itemId>" }.
 * Picking a weapon for a box equips it and unequips whatever it pushes out.
 */

import { ITEM_TOOLTIP_CLASS, MODULE } from "./constants.mjs";
import { useDocument } from "./slots.mjs";

/** Markup for one loadout box. Registered as the "nexLoadoutSlot" partial at init. */
export const LOADOUT_SLOT_PARTIAL = `
<div class="nex-loadout-slot {{cssClass}} {{extra}}" role="button" data-action="nexLoadoutUse"
     data-slot="{{slot}}" {{#if uuid}}data-uuid="{{uuid}}"{{/if}}
     data-tooltip-text="{{name}}" aria-label="{{name}}">
    <img src="{{img}}" alt="" draggable="false">
</div>`;

/* -------------------------------------------- */
/*  Item checks                                 */
/* -------------------------------------------- */

export function isUnarmedStrike(item) {
  if ( item?.type !== "weapon" ) return false;
  const identifier = item.system.identifier ?? "";
  return identifier.includes("unarmed") || /unarmed/i.test(item.name);
}

function isTwoHanded(item) {
  return !!item?.system.properties?.has("two");
}

export function isShield(item) {
  return (item?.type === "equipment") && (item.system.type?.value === "shield");
}

/** Weapons that can go in the top / middle boxes. */
function handWeapons(actor) {
  return actor.items.filter(i => (i.type === "weapon") && !isUnarmedStrike(i));
}

/** Everything that can take up a hand: weapons and shields. */
function handItems(actor) {
  return actor.items.filter(i => ((i.type === "weapon") && !isUnarmedStrike(i)) || isShield(i));
}

/* -------------------------------------------- */
/*  Working out what's in each box              */
/* -------------------------------------------- */

/** @returns {{top: Item|null, middle: Item|null, twoHanded: Item|null, unarmed: Item|null}} */
export function getLoadout(actor) {
  const saved = actor.getFlag(MODULE, "bar")?.loadout ?? {};
  const equipped = handWeapons(actor).filter(i => i.system.equipped);
  const pick = id => equipped.find(i => i.id === id) ?? null;

  // An equipped shield always sits in the off hand
  const shield = actor.items.find(i => isShield(i) && i.system.equipped) ?? null;

  let top = pick(saved.top);
  let middle = shield ?? pick(saved.middle);
  if ( middle === top ) middle = null;

  // Fill empty boxes with any other equipped weapons
  const rest = equipped.filter(i => (i !== top) && (i !== middle));
  if ( !top ) top = rest.shift() ?? null;
  if ( !middle && !isTwoHanded(top) ) middle = rest.find(i => !isTwoHanded(i)) ?? null;

  // A two-handed weapon fills both boxes
  let twoHanded = null;
  if ( isTwoHanded(top) ) twoHanded = top;
  else if ( isTwoHanded(middle) ) twoHanded = middle;
  if ( twoHanded ) top = middle = null;

  const unarmed = actor.items.find(isUnarmedStrike) ?? null;
  return { top, middle, twoHanded, unarmed };
}

/** Context for the template, or null with no actor. */
export function prepareLoadout(actor) {
  if ( !actor ) return null;
  const { top, middle, twoHanded, unarmed } = getLoadout(actor);
  const box = (slot, item, fallback) => (item
    ? { slot, id: item.id, uuid: item.uuid, img: item.img, name: item.name, cssClass: "filled" }
    : { slot, img: fallback.img, name: fallback.name, cssClass: "open" });
  // A two-handed weapon shows in both hand boxes
  if ( twoHanded ) {
    const both = slot => {
      const b = box(slot, twoHanded);
      b.cssClass += " two-handed";
      return b;
    };
    return { top: both("top"), middle: both("middle"), unarmed: box("unarmed", unarmed, UNARMED_FALLBACK) };
  }
  return {
    top: box("top", top, { img: "icons/svg/sword.svg", name: "Main Hand: right-click to choose a weapon" }),
    middle: box("middle", middle, { img: "icons/svg/shield.svg", name: "Off Hand: right-click to choose a weapon or shield" }),
    unarmed: box("unarmed", unarmed, UNARMED_FALLBACK)
  };
}

const UNARMED_FALLBACK = { img: "icons/svg/combat.svg", name: "No Unarmed Strike on this actor" };

/** The item in a loadout box element. */
function itemFor(bar, el) {
  const actor = bar.actor;
  if ( !actor ) return null;
  const { top, middle, twoHanded, unarmed } = getLoadout(actor);
  switch ( el?.dataset.slot ) {
    case "top": return twoHanded ?? top;
    case "middle": return twoHanded ?? middle;
    case "unarmed": return unarmed;
  }
  return null;
}

/* -------------------------------------------- */
/*  Equipping                                   */
/* -------------------------------------------- */

/**
 * Put a weapon or shield in the top or middle box: equip it, unequip whatever it replaces.
 * Shields only go in the middle (off hand) box.
 * @param {NexusHotbar} bar
 * @param {"top"|"middle"} slot
 * @param {Item} item
 */
export async function equipToSlot(bar, slot, item) {
  if ( bar.guardLocked() ) return;
  const actor = bar.actor;
  if ( !actor || !item || isUnarmedStrike(item) ) return;
  if ( isShield(item) && (slot !== "middle") ) {
    return ui.notifications.warn("Shields go in the off hand (middle box).");
  }
  const current = getLoadout(actor);
  const other = slot === "top" ? "middle" : "top";
  const unequip = new Set();
  let loadout;

  if ( isTwoHanded(item) ) {
    // Two-handed: everything else in hand comes off, shields included
    for ( const w of handItems(actor) ) if ( w.system.equipped && (w !== item) ) unequip.add(w);
    loadout = { top: item.id, middle: null };
  }
  else if ( isShield(item) ) {
    // Shield: replaces the off hand (and any other shield), and can't share hands with a two-handed weapon
    if ( current.twoHanded ) unequip.add(current.twoHanded);
    if ( current.middle && (current.middle !== item) ) unequip.add(current.middle);
    for ( const s of actor.items ) if ( isShield(s) && s.system.equipped && (s !== item) ) unequip.add(s);
    loadout = { top: current.top?.id ?? null, middle: item.id };
  }
  else {
    if ( current.twoHanded && (current.twoHanded !== item) ) unequip.add(current.twoHanded);
    const occupant = current[slot];
    const otherItem = current[other];
    if ( (otherItem === item) && isShield(occupant) ) {
      // Moving a weapon into the shield's spot: the shield comes off
      unequip.add(occupant);
      loadout = { [slot]: item.id, [other]: null };
    }
    else if ( otherItem === item ) {
      // Already in the other hand: swap hands
      loadout = { [slot]: item.id, [other]: occupant?.id ?? null };
    }
    else {
      if ( occupant && (occupant !== item) ) unequip.add(occupant);
      loadout = { [slot]: item.id, [other]: otherItem?.id ?? null };
    }
  }

  const updates = [...unequip].map(w => ({ _id: w.id, "system.equipped": false }));
  if ( !item.system.equipped ) updates.push({ _id: item.id, "system.equipped": true });
  if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates);
  await actor.update({ [`flags.${MODULE}.bar.loadout`]: loadout });
  bar.refresh();
}

/** Take the weapon in a box out of hand. */
async function unequipSlot(bar, el) {
  if ( bar.guardLocked() ) return;
  const actor = bar.actor;
  const item = itemFor(bar, el);
  if ( !actor || !item || (el.dataset.slot === "unarmed") ) return;
  await item.update({ "system.equipped": false });
  bar.refresh();
}

/** Dialog listing the actor's weapons (and shields, for the off hand) to put in a box. */
async function chooseWeapon(bar, slot) {
  if ( bar.guardLocked() ) return;
  const actor = bar.actor;
  if ( !actor ) return;
  const weapons = (slot === "middle" ? handItems(actor) : handWeapons(actor))
    .sort((a, b) => (isShield(a) - isShield(b)) || a.name.localeCompare(b.name, game.i18n.lang));
  if ( !weapons.length ) return ui.notifications.info(`${actor.name} has no weapons.`);

  const esc = Handlebars.escapeExpression;
  const current = itemFor(bar, { dataset: { slot } });
  const loadingTooltip = globalThis.dnd5e?.utils?.loadingTooltip;
  const tooltipFor = item => (loadingTooltip
    ? `data-tooltip-html="${esc(loadingTooltip({ uuid: item.uuid }))}"
       data-tooltip-class="${ITEM_TOOLTIP_CLASS}" data-tooltip-direction="RIGHT"`
    : `data-tooltip-text="${esc(item.name)}"`);

  let content = `<div class="nex-choose-list">`;
  for ( const w of weapons ) {
    const tags = [isShield(w) ? "Shield" : isTwoHanded(w) ? "Two-Handed" : "One-Handed"];
    if ( w.system.equipped ) tags.push("Equipped");
    content += `<label class="nex-choose-row" ${tooltipFor(w)}>
      <input type="radio" name="weapon" value="${w.id}" ${w === current ? "checked" : ""}>
      <img src="${esc(w.img)}" alt="">
      <span>${esc(w.name)}</span>
      <span class="nex-choose-tag">${tags.join(", ")}</span>
    </label>`;
  }
  content += `</div>`;

  const label = slot === "top" ? "Main Hand" : "Off Hand";
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `${label}: ${actor.name}`, icon: "fa-solid fa-hand-back-fist" },
    classes: ["nexus-choose-dialog"],
    position: { width: 380 },
    content,
    buttons: [
      {
        action: "equip",
        label: "Equip",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => button.form.querySelector('input[name="weapon"]:checked')?.value ?? null
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  const item = actor.items.get(picked);
  if ( item ) return equipToSlot(bar, slot, item);
}

/* -------------------------------------------- */
/*  Right-click menu, actions, drop             */
/* -------------------------------------------- */

export function loadoutMenuOptions(bar) {
  const isHand = li => li.dataset.slot !== "unarmed";
  return [
    {
      label: "Use",
      icon: "fa-solid fa-play",
      visible: li => !!itemFor(bar, li),
      onClick: (event, li) => useDocument(itemFor(bar, li), event)
    },
    {
      label: "Choose Weapon...",
      icon: "fa-solid fa-list-check",
      visible: li => isHand(li) && !!bar.actor,
      onClick: (event, li) => chooseWeapon(bar, li.dataset.slot)
    },
    {
      label: "Unequip",
      icon: "fa-solid fa-hand",
      visible: li => isHand(li) && !!itemFor(bar, li),
      onClick: (event, li) => unequipSlot(bar, li)
    },
    {
      label: "Open Sheet",
      icon: "fa-solid fa-file-lines",
      visible: li => !!itemFor(bar, li),
      onClick: (event, li) => itemFor(bar, li)?.sheet.render({ force: true })
    }
  ];
}

/** Click a loadout box: attack with it, or choose a weapon if it's empty. @this {NexusHotbar} */
export async function onLoadoutUse(event, target) {
  const item = itemFor(this, target);
  if ( item ) return useDocument(item, event);
  if ( target.dataset.slot !== "unarmed" ) return chooseWeapon(this, target.dataset.slot);
}

/** Drop a weapon from the sheet onto a loadout box. */
export async function onDropLoadout(bar, event) {
  const el = event.target.closest(".nex-loadout-slot");
  const actor = bar.actor;
  if ( !el || !actor ) return;
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if ( data.type !== "Item" ) return;
  const item = await Item.implementation.fromDropData(data);
  if ( !item ) return;
  if ( item.parent?.uuid !== actor.uuid ) {
    return ui.notifications.warn(`${item.name} isn't owned by ${actor.name}. Add it to their sheet first.`);
  }
  if ( el.dataset.slot === "unarmed" ) {
    return ui.notifications.warn("The bottom box is only for Unarmed Strike.");
  }
  if ( !isShield(item) && ((item.type !== "weapon") || isUnarmedStrike(item)) ) {
    return ui.notifications.warn(`${item.name} isn't a weapon or shield you can hold.`);
  }
  return equipToSlot(bar, el.dataset.slot, item);
}
