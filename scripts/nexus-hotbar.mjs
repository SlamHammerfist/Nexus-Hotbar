/**
 * Nexus Hotbar
 * Replaces the core hotbar with a multi-row, tabbed action bar for D&D 5e.
 *
 * This file holds the hotbar application itself, startup, and the hooks that keep it
 * up to date. Each feature lives in its own file:
 *   constants.mjs  shared constants (tabs, activation types)
 *   items.mjs      dnd5e item helpers (activation types, auto-fill picks, passives)
 *   slots.mjs      slot grid, tabs, rows, highlighting, auto-fill, drag and drop
 *   passives.mjs   passive features frame and chooser dialog
 *   loadout.mjs    weapon loadout column (main hand, off hand, unarmed strike)
 *   portrait.mjs   token portrait with health bar and death saves
 *   stats.mjs      stat column (AC, speed, skills, saves...) left of the portrait
 *   effects.mjs    active conditions / timed effects
 *   combat.mjs     initiative / turn controls and rests
 *   settings.mjs   settings and the settings dialog
 */

import { ITEM_TOOLTIP_CLASS, LAYOUT_DEFAULTS, MODULE, SECTIONS, TABS } from "./constants.mjs";
import { alertTurn, applyTurnFlash, onEndTurn, onInitiative, onRest, prepareCombat } from "./combat.mjs";
import { activateEffects, prepareEffects } from "./effects.mjs";
import {
  LOADOUT_SLOT_PARTIAL, loadoutMenuOptions, onDropLoadout, onLoadoutUse, prepareLoadout
} from "./loadout.mjs";
import {
  choosePassives, clearPassives, onChoosePassives, onDropPassive, onPassive, passiveMenuOptions,
  preparePassives, removePassive
} from "./passives.mjs";
import { activatePortrait, onDeathPip, onDeathRoll, onPortrait, preparePortrait } from "./portrait.mjs";
import { onStatClick, prepareStats, statMenuOptions } from "./stats.mjs";
import { DEFAULT_ACCENT, onSettings, registerSettings, validColor } from "./settings.mjs";
import {
  autoFill, clearSlots, onDragEnd, onDragOver, onDragStart, onDropSlot, onClearHighlight, onHighlight, onRow, onTab, onUse,
  prepareSlots, readBar, resolveEntry, slotMenuOptions, useDocument
} from "./slots.mjs";

class NexusHotbar extends foundry.applications.ui.Hotbar {

  static DEFAULT_OPTIONS = {
    classes: ["nexus-hotbar"],
    actions: {
      nexUse: onUse,
      nexTab: onTab,
      nexHighlight: onHighlight,
      nexClearHighlight: onClearHighlight,
      nexRow: onRow,
      nexPassive: onPassive,
      nexChoosePassives: onChoosePassives,
      nexSettings: onSettings,
      nexRest: onRest,
      nexInitiative: onInitiative,
      nexEndTurn: onEndTurn,
      nexLoadoutUse: onLoadoutUse,
      nexPortrait: onPortrait,
      nexDeathRoll: onDeathRoll,
      nexDeathPip: onDeathPip,
      nexStat: onStatClick
    }
  };

  static PARTS = {
    hotbar: {
      root: true,
      template: `modules/${MODULE}/templates/hotbar.hbs`
    }
  };

  /** Activation types currently highlighted (just on this screen). */
  highlight = new Set();

  /** Drag state: the slot index a drag started from, and the current drop target. */
  drag = { index: null, target: null };

  /** Debounced re-render used by the document hooks. */
  refresh = foundry.utils.debounce(() => this.render(), 50);

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** The actor the bar is showing: one controlled token you own, else your assigned character. */
  get actor() {
    const controlled = canvas?.tokens?.controlled ?? [];
    if ( controlled.length === 1 ) {
      const actor = controlled[0].actor;
      if ( actor?.isOwner ) return actor;
    }
    return game.user.character ?? null;
  }

  /**
   * The document the bar's layout is saved on: the actor, or the user when no actor is shown.
   * Everything saved there is shared, so the player and the GM see the same bar for an actor.
   */
  get layoutDoc() {
    return this.actor ?? game.user;
  }

  /**
   * Flag key for remembering this actor's tab on the user ("." isn't allowed inside a flag key).
   * @param {Actor} actor
   */
  static tabKey(actor) {
    return actor.uuid.replaceAll(".", "_");
  }

  /** Tabs picked this session, used when "Remember Last Tab" is off. */
  sessionTabs = new Map();

  /**
   * Selected tab, per user for each actor so everyone picks their own.
   * "Remember Last Tab" on: saved on your user and kept between sessions.
   * Off: kept until reload, then back to the chosen starting tab.
   */
  get activeTab() {
    const actor = this.actor;
    if ( !actor ) return "macros";
    const key = NexusHotbar.tabKey(actor);
    const start = game.settings.get(MODULE, "startTab");
    const tab = start === "last"
      ? game.user.getFlag(MODULE, "tabs")?.[key]
      : (this.sessionTabs.get(key) ?? start);
    return tab in TABS ? tab : "inventory";
  }

  /** Slots per row, saved on the actor (or user). */
  get columns() {
    const value = Number(this.layoutDoc.getFlag(MODULE, "bar")?.layout?.columns);
    return Math.clamp(value || LAYOUT_DEFAULTS.columns, 5, 20);
  }

  /** Which sections are shown, saved on the actor (or user). Missing entries count as shown. */
  get sections() {
    const saved = this.layoutDoc.getFlag(MODULE, "bar")?.layout?.show ?? {};
    return Object.fromEntries(Object.keys(SECTIONS).map(key => [key, saved[key] !== false]));
  }

  /** Ask before right-click removes an effect. Saved on the actor; on by default. */
  get confirmEffectRemoval() {
    return this.layoutDoc.getFlag(MODULE, "bar")?.layout?.confirmEffects !== false;
  }

  /** Slot size in pixels, saved on the actor (or user). */
  get slotSize() {
    const value = Number(this.layoutDoc.getFlag(MODULE, "bar")?.layout?.slotSize);
    return Math.clamp(value || LAYOUT_DEFAULTS.slotSize, 32, 72);
  }

  /**
   * Core's number-key bindings (1-9, 0) read this. Map them to the first row of the current tab.
   * @override
   */
  get slots() {
    const { actor, slots } = readBar(this);
    return Array.from({ length: Math.min(this.columns, 10) }, (_, i) => {
      const doc = resolveEntry(slots[i], actor);
      return {
        slot: i,
        key: i < 9 ? i + 1 : 0,
        macro: doc ? { execute: () => useDocument(doc) } : null
      };
    });
  }

  /* -------------------------------------------- */
  /*  Fade when idle                              */
  /* -------------------------------------------- */

  #idleTimer = null;
  #hovered = false;

  /**
   * Bring the bar back to full opacity and restart the idle countdown
   * (unless the mouse is over it or fading is off).
   */
  wake() {
    const el = this.element;
    if ( !el ) return;
    clearTimeout(this.#idleTimer);
    el.classList.remove("nex-idle");
    const seconds = Number(game.settings.get(MODULE, "idleFade")) || 0;
    const opacity = Math.clamp(Number(game.settings.get(MODULE, "idleOpacity")) || 30, 10, 90);
    el.style.setProperty("--nex-idle-opacity", String(opacity / 100));
    if ( !seconds || this.#hovered ) return;
    this.#idleTimer = setTimeout(() => {
      // Stay awake while you're typing in one of the bar's boxes (HP, temp HP)
      const active = document.activeElement;
      if ( this.#hovered || (el.contains(active) && active.matches("input, select, textarea")) ) {
        return this.wake();
      }
      el.classList.add("nex-idle");
    }, seconds * 1000);
  }

  #activateIdleFade() {
    const el = this.element;
    // Core's "faded-ui" dims the hotbar the moment the mouse leaves; our own setting replaces it
    el.classList.remove("faded-ui");
    el.addEventListener("pointerenter", () => {
      this.#hovered = true;
      this.wake();
    });
    el.addEventListener("pointerleave", () => {
      this.#hovered = false;
      // A clicked button keeps keyboard focus; let it go so it doesn't hold the bar awake
      const active = document.activeElement;
      if ( el.contains(active) && !active.matches("input, select, textarea") ) active.blur();
      this.wake();
    });
    this.wake();
  }

  /** Warn and return true if the bar is locked. */
  guardLocked() {
    if ( !this.locked ) return false;
    ui.notifications.warn("HOTBAR.IsLocked", { localize: true });
    return true;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const actor = this.actor;
    // A hidden filter shouldn't keep dimming slots
    if ( !this.sections.highlights ) this.highlight.clear();
    return {
      actor: actor ? { name: actor.name } : null,
      effects: prepareEffects(actor),
      combat: prepareCombat(actor),
      passives: preparePassives(actor),
      loadout: prepareLoadout(actor),
      portrait: preparePortrait(actor),
      stats: prepareStats(actor),
      slotSize: this.slotSize,
      scale: Math.clamp(Number(game.settings.get(MODULE, "barScale")) || 100, 50, 150) / 100,
      show: this.sections,
      confirmEffects: this.confirmEffectRemoval,
      ...prepareSlots(this)
    };
  }

  /** @override */
  async _onFirstRender(_context, _options) {
    game.macros.apps.push(this);
    this.element.setAttribute("aria-roledescription", _loc("HOTBAR.Label"));
    this.#activateIdleFade();
    this._onResize();
    this._createContextMenu(this._getContextMenuOptions, ".nex-slot", {
      fixed: true,
      hookName: "getNexusHotbarContextOptions",
      parentClassHooks: false
    });
    this._createContextMenu(this._getPassiveContextMenuOptions, ".nex-passive", {
      fixed: true,
      hookName: "getNexusHotbarPassiveContextOptions",
      parentClassHooks: false
    });
    this._createContextMenu(this._getLoadoutContextMenuOptions, ".nex-loadout-slot", {
      fixed: true,
      hookName: "getNexusHotbarLoadoutContextOptions",
      parentClassHooks: false
    });
    this._createContextMenu(this._getStatContextMenuOptions, ".nex-stat", {
      fixed: true,
      hookName: "getNexusHotbarStatContextOptions",
      parentClassHooks: false
    });
  }

  /** @override */
  async _onRender(context, _options) {
    // Foundry only refreshes the bar's inner content on re-render, not the outer element's
    // attributes, so size and scale are applied here every time.
    this.element.style.setProperty("--nex-slot-size", `${context.slotSize}px`);
    this.element.style.zoom = String(context.scale);
    this.element.style.setProperty("--nex-accent",
      validColor(game.settings.get(MODULE, "accentColor")) ?? DEFAULT_ACCENT);

    this._updateToggles();
    activateEffects(this);
    activatePortrait(this);
    applyTurnFlash(this);

    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: ".nex-slot.filled",
      dropSelector: ".nex-slot, .nex-passives, .nex-loadout-slot",
      callbacks: {
        dragstart: event => onDragStart(this, event),
        dragend: () => onDragEnd(this),
        dragover: event => onDragOver(this, event),
        drop: event => {
          this.drag.target?.classList.remove("drop-target");
          this.drag.target = null;
          if ( event.target.closest(".nex-passives") ) return onDropPassive(this, event);
          if ( event.target.closest(".nex-loadout-slot") ) return onDropLoadout(this, event);
          return onDropSlot(this, event);
        }
      }
    }).bind(this.element);

    // Use the dnd5e rich item tooltip when it's available
    const loadingTooltip = globalThis.dnd5e?.utils?.loadingTooltip;
    if ( loadingTooltip ) {
      for ( const el of this.element.querySelectorAll(
        ".nex-slot[data-uuid], .nex-passive[data-uuid], .nex-loadout-slot[data-uuid]") ) {
        delete el.dataset.tooltipText;
        Object.assign(el.dataset, {
          tooltipHtml: loadingTooltip({ uuid: el.dataset.uuid }),
          tooltipClass: ITEM_TOOLTIP_CLASS,
          tooltipDirection: "UP"
        });
      }
    }
  }

  /** @override */
  _getContextMenuOptions() {
    return slotMenuOptions(this);
  }

  _getPassiveContextMenuOptions() {
    return passiveMenuOptions(this);
  }

  _getLoadoutContextMenuOptions() {
    return loadoutMenuOptions(this);
  }

  _getStatContextMenuOptions() {
    return statMenuOptions(this);
  }

  /* -------------------------------------------- */
  /*  Public API (for macros and other modules)   */
  /* -------------------------------------------- */

  /** Auto-fill a row (index) or every row (null) of the current tab. */
  autoFill(row=null) {
    return autoFill(this, row);
  }

  /** Clear a row (index) or every row (null) of the current tab. */
  clear(row=null) {
    return clearSlots(this, row);
  }

  choosePassives() {
    return choosePassives(this);
  }

  removePassive(id) {
    return removePassive(this, id);
  }

  clearPassives() {
    return clearPassives(this);
  }
}

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  registerSettings();
  Handlebars.registerPartial("nexLoadoutSlot", LOADOUT_SLOT_PARTIAL);
  if ( game.settings.get(MODULE, "enabled") ) CONFIG.ui.hotbar = NexusHotbar;
});

/* Re-render when what the bar shows changes. */
function refreshFor(actor) {
  const bar = ui.hotbar;
  if ( !(bar instanceof NexusHotbar) ) return;
  if ( !actor || (actor.uuid === bar.actor?.uuid) ) bar.refresh();
}

Hooks.on("controlToken", () => {
  refreshFor(null);
  if ( ui.hotbar instanceof NexusHotbar ) ui.hotbar.wake(); // selecting a token shows its bar
});
Hooks.on("updateActor", actor => refreshFor(actor));
Hooks.on("updateToken", token => refreshFor(token.actor));
Hooks.on("createItem", item => refreshFor(item.parent));
Hooks.on("updateItem", item => refreshFor(item.parent));
Hooks.on("deleteItem", item => refreshFor(item.parent));
for ( const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"] ) {
  Hooks.on(hook, effect => {
    const parent = effect.parent;
    refreshFor(parent?.documentName === "Item" ? parent.parent : parent);
  });
}
for ( const hook of ["createCombat", "updateCombat", "deleteCombat",
  "createCombatant", "updateCombatant", "deleteCombatant"] ) {
  Hooks.on(hook, () => refreshFor(null));
}
Hooks.on("updateCombat", (combat, changes) => alertTurn(combat, changes));
Hooks.on("updateUser", user => {
  if ( user.isSelf ) refreshFor(null);
});
Hooks.on("canvasReady", () => refreshFor(null));
