/**
 * The slot grid: per-tab storage, rendering data, tabs, rows, highlighting,
 * the right-click menu, auto-fill, clearing, and drag and drop.
 *
 * Layout data lives in flags, so it travels with the actor:
 *   actor.flags["nexus-hotbar"].bar = {
 *     rows:  { <tab>: 2, ... },
 *     slots: { <tab>: ["Item.abc", null, "Macro.xyz", ...], ... }
 *   }
 * Tab ids come from the system module ("items" with none).
 * With no token selected and no assigned character, the bar shows a plain
 * macro grid stored on the User the same way (tab key "macros").
 */

import { MAX_ROWS, MODULE } from "./constants.mjs";
import {
  activationTypes, autoFillCandidates, getActivations, getTabs, primaryActivation, slotInfo, useDocument
} from "./system.mjs";

/* -------------------------------------------- */
/*  Storage                                     */
/* -------------------------------------------- */

/** Turn a stored entry ("Item.<id>" / "Macro.<id>") into a document. */
export function resolveEntry(entry, actor) {
  if ( typeof entry !== "string" ) return null;
  const [type, id] = entry.split(".");
  if ( type === "Item" ) return actor?.items.get(id) ?? null;
  if ( type === "Macro" ) return game.macros.get(id) ?? null;
  return null;
}

/** Read the layout for the bar's current actor (or user) and tab. */
export function readBar(bar) {
  const actor = bar.actor;
  const doc = actor ?? game.user;
  const tab = bar.activeTab;
  const data = doc.getFlag(MODULE, "bar") ?? {};
  const rows = Math.clamp(Number(data.rows?.[tab]) || (actor ? 2 : 1), 1, MAX_ROWS);
  const slots = Array.from(data.slots?.[tab] ?? []);
  return { actor, doc, tab, rows, slots };
}

export async function writeBar(bar, doc, tab, { rows, slots }={}) {
  const update = {};
  if ( rows !== undefined ) update[`flags.${MODULE}.bar.rows.${tab}`] = rows;
  if ( slots ) update[`flags.${MODULE}.bar.slots.${tab}`] = Array.from(slots, s => s ?? null);
  await doc.update(update);
  bar.refresh();
}

export { useDocument };

/* -------------------------------------------- */
/*  Rendering                                   */
/* -------------------------------------------- */

/** Context for the grid, tabs and highlight buttons. */
export function prepareSlots(bar) {
  const { actor, tab, rows: rowCount, slots } = readBar(bar);
  const cols = bar.columns;
  const filtering = bar.highlight.size > 0;

  const rows = [];
  for ( let r = 0; r < rowCount; r++ ) {
    const cells = [];
    for ( let c = 0; c < cols; c++ ) {
      const index = (r * cols) + c;
      cells.push(prepareCell(bar, index, resolveEntry(slots[index], actor), filtering));
    }
    rows.push({ index: r, cells });
  }

  return {
    tabs: Object.entries(getTabs()).map(([id, t]) => ({ id, ...t, active: id === tab })),
    highlights: Object.entries(getActivations()).map(([id, a]) => ({ id, ...a, active: bar.highlight.has(id) })),
    filtering,
    rows,
    canAddRow: rowCount < MAX_ROWS,
    canRemoveRow: rowCount > 1
  };
}

function prepareCell(bar, index, doc, filtering) {
  if ( !doc ) return { index, cssClass: "open", ariaLabel: _loc("HOTBAR.Empty") };

  const cell = { index, img: doc.img, name: doc.name, ariaLabel: doc.name, cssClass: "filled" };
  if ( doc.documentName !== "Item" ) {
    cell.cssClass += " macro";
    if ( filtering ) cell.cssClass += " dim";
    return cell;
  }

  const item = doc;
  const activations = getActivations();
  const types = activationTypes(item);
  cell.uuid = item.uuid;
  cell.act = primaryActivation(types);
  if ( cell.act ) cell.actColor = activations[cell.act].color;

  // Badges from the system: level, charges or quantity; greyed out when it can't be used right now
  const info = slotInfo(item);
  if ( info.level ) cell.level = String(info.level);
  if ( (info.count !== undefined) && (info.count !== null) ) cell.count = String(info.count);
  if ( info.depleted ) cell.cssClass += " depleted";

  // Highlighting
  if ( filtering ) {
    const match = Object.keys(activations).find(t => bar.highlight.has(t) && types.has(t));
    if ( match ) {
      cell.cssClass += " match";
      cell.matchAct = match;
      cell.matchColor = activations[match].color;
    }
    else cell.cssClass += " dim";
  }
  return cell;
}

/* -------------------------------------------- */
/*  Right-click menu                            */
/* -------------------------------------------- */

export function slotMenuOptions(bar) {
  const docFor = li => {
    const { actor, slots } = readBar(bar);
    return resolveEntry(slots[Number(li.dataset.index)], actor);
  };
  const rowOf = li => Number(li.dataset.row);

  return [
    {
      label: "Use",
      icon: "fa-solid fa-play",
      visible: li => !!docFor(li),
      onClick: (event, li) => useDocument(docFor(li), event)
    },
    {
      label: "Open Sheet",
      icon: "fa-solid fa-file-lines",
      visible: li => !!docFor(li)?.sheet,
      onClick: (event, li) => docFor(li)?.sheet.render({ force: true })
    },
    {
      label: "Remove from Bar",
      icon: "fa-solid fa-xmark",
      visible: li => !!docFor(li),
      onClick: (event, li) => setSlot(bar, Number(li.dataset.index), null)
    },
    {
      label: "Auto-fill This Row",
      icon: "fa-solid fa-wand-magic-sparkles",
      visible: () => !!bar.actor,
      onClick: (event, li) => autoFill(bar, rowOf(li))
    },
    {
      label: "Auto-fill All Rows",
      icon: "fa-solid fa-layer-group",
      visible: () => !!bar.actor,
      onClick: () => autoFill(bar, null)
    },
    {
      label: "Clear This Row",
      icon: "fa-solid fa-eraser",
      onClick: (event, li) => clearSlots(bar, rowOf(li))
    },
    {
      label: "Clear All Rows",
      icon: "fa-solid fa-trash",
      onClick: () => clearSlots(bar, null)
    }
  ];
}

/* -------------------------------------------- */
/*  Auto-fill and clearing                      */
/* -------------------------------------------- */

/**
 * Fill empty slots on the current tab with the actor's usable items.
 * If highlight buttons are on, only items of those activation types are added.
 * @param {NexusHotbar} bar
 * @param {number|null} row   A row index, or null for every row
 */
export async function autoFill(bar, row=null) {
  if ( bar.guardLocked() ) return;
  const { actor, doc, tab, rows, slots } = readBar(bar);
  if ( !actor ) return;
  const cols = bar.columns;
  const highlight = bar.highlight;

  let candidates = autoFillCandidates(actor, tab);
  if ( highlight.size ) {
    candidates = candidates.filter(i => [...activationTypes(i)].some(t => highlight.has(t)));
  }
  const visible = rows * cols;
  const present = new Set(slots.slice(0, visible).filter(Boolean));
  const queue = candidates.map(i => `Item.${i.id}`).filter(e => !present.has(e));

  const start = row === null ? 0 : row * cols;
  const end = row === null ? visible : start + cols;
  let added = 0;
  for ( let i = start; (i < end) && queue.length; i++ ) {
    if ( slots[i] && resolveEntry(slots[i], actor) ) continue;
    slots[i] = queue.shift();
    added++;
  }

  const kind = highlight.size
    ? [...highlight].map(t => `${getActivations()[t]?.label ?? t}s`).join(" / ")
    : getTabs()[tab]?.label ?? "Items";
  if ( !added && !queue.length ) {
    return ui.notifications.info(`Nothing new to add from ${actor.name}'s ${kind}.`);
  }
  if ( !added ) return ui.notifications.warn("No empty slots. Add a row or clear some slots first.");

  await writeBar(bar, doc, tab, { slots });
  let msg = `Added ${added} to ${getTabs()[tab]?.label ?? "Items"}.`;
  if ( queue.length ) msg += ` ${queue.length} more didn't fit. Add a row and auto-fill again.`;
  ui.notifications.info(msg);
}

/**
 * Empty a row, or every row, of the current tab.
 * @param {NexusHotbar} bar
 * @param {number|null} row
 */
export async function clearSlots(bar, row=null) {
  if ( bar.guardLocked() ) return;
  const { doc, tab, rows, slots } = readBar(bar);
  const cols = bar.columns;
  const label = getTabs()[tab]?.label ?? "Macros";

  if ( row === null ) {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Clear ${label}`, icon: "fa-solid fa-trash" },
      content: `<p>Remove everything from the ${label} bar? Items and macros themselves are not deleted.</p>`,
      modal: true
    });
    if ( !proceed ) return;
    return writeBar(bar, doc, tab, { slots: slots.map((s, i) => (i < rows * cols ? null : s)) });
  }
  for ( let i = row * cols; i < (row + 1) * cols; i++ ) slots[i] = null;
  return writeBar(bar, doc, tab, { slots });
}

async function setSlot(bar, index, entry) {
  if ( bar.guardLocked() ) return;
  const { doc, tab, slots } = readBar(bar);
  slots[index] = entry;
  return writeBar(bar, doc, tab, { slots });
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

/** Click a slot. @this {NexusHotbar} */
export async function onUse(event, target) {
  const { actor, slots } = readBar(this);
  return useDocument(resolveEntry(slots[Number(target.dataset.index)], actor), event);
}

/** Switch tab. Remembered on your user for this actor, so it doesn't change anyone else's view. @this {NexusHotbar} */
export async function onTab(event, target) {
  const actor = this.actor;
  const tab = target.dataset.tab;
  if ( !actor || !(tab in getTabs()) || (tab === this.activeTab) ) return;
  const key = this.constructor.tabKey(actor);
  if ( game.settings.get(MODULE, "startTab") === "last" ) await game.user.setFlag(MODULE, `tabs.${key}`, tab);
  else this.sessionTabs.set(key, tab);
  this.refresh();
}

/** Toggle an activation type highlight (e.g. Action / Bonus Action / Reaction). @this {NexusHotbar} */
export async function onHighlight(event, target) {
  const type = target.dataset.type;
  if ( this.highlight.has(type) ) this.highlight.delete(type);
  else this.highlight.add(type);
  return this.render();
}

/** Turn every activation type highlight off. @this {NexusHotbar} */
export async function onClearHighlight(event, target) {
  if ( !this.highlight.size ) return;
  this.highlight.clear();
  return this.render();
}

/** + / - row buttons. @this {NexusHotbar} */
export async function onRow(event, target) {
  if ( this.guardLocked() ) return;
  const { doc, tab, rows } = readBar(this);
  const next = Math.clamp(rows + Number(target.dataset.delta), 1, MAX_ROWS);
  if ( next !== rows ) return writeBar(this, doc, tab, { rows: next });
}

/* -------------------------------------------- */
/*  Drag and Drop                               */
/* -------------------------------------------- */

export function onDragStart(bar, event) {
  const el = event.target.closest(".nex-slot");
  if ( bar.locked ) {
    ui.notifications.warn("HOTBAR.IsLocked", { localize: true });
    return event.preventDefault();
  }
  const { actor, tab, slots } = readBar(bar);
  const index = Number(el.dataset.index);
  const doc = resolveEntry(slots[index], actor);
  if ( !doc ) return event.preventDefault();
  bar.drag.index = index;
  const data = foundry.utils.mergeObject(doc.toDragData(), { nexusSlot: { tab, index } });
  event.dataTransfer.setData("text/plain", JSON.stringify(data));
}

export function onDragEnd(bar) {
  bar.drag.index = null;
  bar.drag.target?.classList.remove("drop-target");
  bar.drag.target = null;
}

export function onDragOver(bar, event) {
  const target = event.target.closest(".nex-slot, .nex-passives, .nex-loadout-slot");
  if ( target === bar.drag.target ) return;
  bar.drag.target?.classList.remove("drop-target");
  bar.drag.target = target;
  if ( target && (Number(target.dataset.index) !== bar.drag.index) ) target.classList.add("drop-target");
}

/** Drop onto a slot: move within the bar, or add an item / macro / document. */
export async function onDropSlot(bar, event) {
  const el = event.target.closest(".nex-slot");
  if ( !el || bar.guardLocked() ) return;
  const index = Number(el.dataset.index);

  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  const { actor, doc, tab, slots } = readBar(bar);

  // Moving a slot within the bar: swap the two slots
  if ( data.nexusSlot ) {
    const from = data.nexusSlot.index;
    if ( (data.nexusSlot.tab !== tab) || (from === index) ) return;
    [slots[from], slots[index]] = [slots[index] ?? null, slots[from] ?? null];
    return writeBar(bar, doc, tab, { slots });
  }

  const entry = await entryFromDrop(bar, data, actor);
  if ( !entry ) return;

  // If it's already on this tab, swap it into place instead of duplicating it
  const existing = slots.indexOf(entry);
  if ( (existing !== -1) && (existing !== index) ) slots[existing] = slots[index] ?? null;
  slots[index] = entry;
  return writeBar(bar, doc, tab, { slots });
}

/** Work out what to store for a dropped document. */
async function entryFromDrop(bar, data, actor) {
  if ( data.type === "Item" ) {
    if ( !actor ) {
      ui.notifications.warn("Select a token to add items to its bar.");
      return null;
    }
    const item = await Item.implementation.fromDropData(data);
    if ( !item ) return null;
    if ( item.parent?.uuid !== actor.uuid ) {
      ui.notifications.warn(`${item.name} isn't owned by ${actor.name}. Add it to their sheet first.`);
      return null;
    }
    return `Item.${item.id}`;
  }

  const cls = CONFIG[data.type]?.documentClass;
  const dropped = await cls?.fromDropData(data);
  if ( !dropped ) return null;

  let macro;
  if ( data.type === "Macro" ) {
    macro = game.macros.has(dropped.id) ? dropped : await Macro.implementation.create(dropped.toObject());
  }
  else if ( data.type === "RollTable" ) macro = await bar._createRollTableRollMacro(dropped);
  else macro = await bar._createDocumentSheetToggle(dropped);
  return macro ? `Macro.${macro.id}` : null;
}
