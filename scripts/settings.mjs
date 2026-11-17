/**
 * The on/off client setting, and the gear button's settings dialog. The dialog saves to the
 * actor being shown (or the user with no actor), so changes are shared with the GM and players.
 */

import { MODULE } from "./constants.mjs";
import { readStats, statCount, statOptions, writeStats } from "./stats.mjs";
import { activeSystem, availableSections, startTabs } from "./system.mjs";

/** Register settings. Called during init. */
export function registerSettings() {
  game.settings.register(MODULE, "enabled", {
    name: "Use Nexus Hotbar",
    hint: "Replace the core macro hotbar with the Nexus Hotbar on this computer.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  // Your-turn alert: a personal choice, saved on your user so it follows you to any computer.
  // Changed from the gear dialog.
  game.settings.register(MODULE, "turnAlert", {
    name: "Your Turn Alert",
    scope: "user",
    config: false,
    type: String,
    choices: TURN_ALERTS,
    default: "both"
  });

  // Which tab a bar opens on: the last one you used, or always the same one. Per user.
  // The choices depend on the system module's tabs (see startTabs), so they're checked in the dialog.
  game.settings.register(MODULE, "startTab", {
    name: "Starting Tab",
    scope: "user",
    config: false,
    type: String,
    default: "last",
    onChange: () => ui.hotbar?.render()
  });

  // Overall size of the bar, in percent. Per user, since it depends on your screen.
  game.settings.register(MODULE, "barScale", {
    name: "Bar Scale",
    scope: "user",
    config: false,
    type: Number,
    default: 100,
    onChange: () => ui.hotbar?.render()
  });

  // Highlight colour for hover, the selected tab, drop targets and so on. Per user.
  game.settings.register(MODULE, "accentColor", {
    name: "Accent Colour",
    scope: "user",
    config: false,
    type: String,
    default: DEFAULT_ACCENT,
    onChange: () => ui.hotbar?.render()
  });

  // Fade the bar when the mouse hasn't been over it for a while. Per user.
  game.settings.register(MODULE, "idleFade", {
    name: "Fade When Idle",
    scope: "user",
    config: false,
    type: String,
    choices: IDLE_FADES,
    default: "0",
    onChange: () => ui.hotbar?.wake()
  });
  game.settings.register(MODULE, "idleOpacity", {
    name: "Idle Opacity",
    scope: "user",
    config: false,
    type: Number,
    default: 30,
    onChange: () => ui.hotbar?.wake()
  });

  // Slots per row and slot size are saved on each actor (gear button), not here,
  // so they're shared between the player and the GM.
}

/** Foundry's orange, used until an accent colour is picked. */
export const DEFAULT_ACCENT = "#ff6400";

/** Options for fading the bar when idle: seconds before it fades ("0" = never). */
export const IDLE_FADES = {
  0: "Never",
  3: "After 3 seconds",
  5: "After 5 seconds",
  10: "After 10 seconds",
  30: "After 30 seconds"
};

/** Options for the your-turn alert. */
export const TURN_ALERTS = {
  off: "Off",
  sound: "Sound",
  flash: "Flash the bar",
  both: "Sound and flash"
};

/** A "#rrggbb" colour, or null if it isn't one. */
export function validColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value.toLowerCase() : null;
}

/** Settings tab open last time, so the dialog reopens where you left it. */
let lastSettingsTab = "general";

/** Show / hide checkboxes for each section of the bar. */
function sectionFields(shown) {
  let html = `<h4 class="nex-settings-heading">Show</h4><div class="nex-settings-checks">`;
  for ( const [key, label] of Object.entries(availableSections()) ) {
    html += `<label class="checkbox">
      <input type="checkbox" name="show_${key}" ${shown[key] ? "checked" : ""}> ${label}
    </label>`;
  }
  return `${html}</div>`;
}

/** Stat box pickers for the current actor, as form groups. */
function statFields(actor) {
  if ( !actor ) return "";
  const esc = Handlebars.escapeExpression;
  const options = statOptions(actor);
  const current = readStats(actor);
  let html = `<h4 class="nex-settings-heading">Stat Boxes</h4>`;
  for ( let i = 0; i < statCount(); i++ ) {
    let opts = `<option value="">None</option>`;
    let group = null;
    for ( const opt of options ) {
      if ( opt.group !== group ) {
        if ( group ) opts += `</optgroup>`;
        group = opt.group;
        opts += `<optgroup label="${esc(group)}">`;
      }
      opts += `<option value="${esc(opt.key)}" ${opt.key === current[i] ? "selected" : ""}>${esc(opt.label)}</option>`;
    }
    if ( group ) opts += `</optgroup>`;
    html += `
      <div class="form-group">
        <label for="nex-res-${i}">${["Top", "Middle", "Bottom"][i] ?? `Box ${i + 1}`}</label>
        <div class="form-fields"><select id="nex-res-${i}" name="res${i}">${opts}</select></div>
      </div>`;
  }
  return html;
}

/**
 * Gear button: settings for the bar being shown. Everything here is saved on the actor
 * (or on your user when no actor is shown), so the player and the GM see the same thing.
 * @this {NexusHotbar}
 */
export async function onSettings() {
  const actor = this.actor;
  const doc = this.layoutDoc;
  if ( !doc.isOwner ) return ui.notifications.warn(`You don't have permission to change ${doc.name}'s bar.`);
  const columns = this.columns;
  const slotSize = this.slotSize;
  const turnAlert = game.settings.get(MODULE, "turnAlert");
  const startTab = game.settings.get(MODULE, "startTab");
  const START_TABS = startTabs();
  const hasStats = !!(actor && activeSystem()?.stats);
  const barScale = game.settings.get(MODULE, "barScale");
  const accentColor = validColor(game.settings.get(MODULE, "accentColor")) ?? DEFAULT_ACCENT;
  const idleFade = String(game.settings.get(MODULE, "idleFade"));
  const idleOpacity = game.settings.get(MODULE, "idleOpacity");
  const esc = Handlebars.escapeExpression;
  const select = (name, choices, current) => `<select id="nex-${name}" name="${name}">${
    Object.entries(choices).map(([k, v]) => `<option value="${k}" ${k === current ? "selected" : ""}>${v}</option>`).join("")
  }</select>`;
  const owner = esc(actor ? actor.name : "your macro bar");

  // General: how the bar behaves
  const general = `
    <p class="hint nex-settings-scope"><i class="fa-solid fa-user"></i> Just for you</p>
    <div class="form-group">
      <label for="nex-startTab">Starting Tab</label>
      <div class="form-fields">${select("startTab", START_TABS, startTab)}</div>
      <p class="hint">Which tab a character's bar opens on.</p>
    </div>
    <div class="form-group">
      <label for="nex-turnAlert">Your Turn Alert</label>
      <div class="form-fields">${select("turnAlert", TURN_ALERTS, turnAlert)}</div>
      <p class="hint">When one of your characters' turns comes up in combat.</p>
    </div>
    ${actor ? `
    <p class="hint nex-settings-scope"><i class="fa-solid fa-users"></i> Shared for ${owner}</p>
    <div class="nex-settings-checks">
      <label class="checkbox"><input type="checkbox" name="confirmEffects"
        ${this.confirmEffectRemoval ? "checked" : ""}> Confirm before removing effects</label>
    </div>` : ""}`;

  // Appearance: size and which parts show
  const appearance = `
    <p class="hint nex-settings-scope"><i class="fa-solid fa-user"></i> Just for you</p>
    <div class="form-group">
      <label for="nex-barScale">Bar Scale</label>
      <div class="form-fields">
        <input id="nex-barScale" type="range" name="barScale" value="${barScale}" min="50" max="150" step="5">
        <output class="nex-range-value" data-for="barScale">${barScale}%</output>
      </div>
      <p class="hint">Shrink or grow the whole bar to suit your screen (50% to 150%).</p>
    </div>
    <div class="form-group">
      <label for="nex-accentColor">Accent Colour</label>
      <div class="form-fields">
        <input id="nex-accentColor" type="color" name="accentColor" value="${accentColor}">
        <button type="button" class="nex-accent-reset" data-tooltip-text="Back to Foundry orange">
          <i class="fa-solid fa-rotate-left" inert></i> Reset
        </button>
      </div>
      <p class="hint">Glow on hover, the selected tab, drop targets and other highlights.</p>
    </div>
    <div class="form-group">
      <label for="nex-idleFade">Fade When Idle</label>
      <div class="form-fields">${select("idleFade", IDLE_FADES, idleFade)}</div>
      <p class="hint">Dim the bar when the mouse hasn't been over it for a while. Hover to bring it back.</p>
    </div>
    <div class="form-group">
      <label for="nex-idleOpacity">Faded Opacity</label>
      <div class="form-fields">
        <input id="nex-idleOpacity" type="range" name="idleOpacity" value="${idleOpacity}" min="10" max="90" step="5">
        <output class="nex-range-value" data-for="idleOpacity">${idleOpacity}%</output>
      </div>
      <p class="hint">How visible the bar stays while faded.</p>
    </div>
    <p class="hint nex-settings-scope"><i class="fa-solid fa-users"></i> Shared for ${owner}</p>
    <div class="form-group">
      <label for="nex-columns">Slots per Row</label>
      <div class="form-fields">
        <input id="nex-columns" type="number" name="columns" value="${columns}" min="5" max="20" step="1">
      </div>
      <p class="hint">How many slots each row holds (5 to 20).</p>
    </div>
    <div class="form-group">
      <label for="nex-slot-size">Slot Size</label>
      <div class="form-fields">
        <input id="nex-slot-size" type="number" name="slotSize" value="${slotSize}" min="32" max="72" step="2">
      </div>
      <p class="hint">Width and height of each slot in pixels (32 to 72).</p>
    </div>
    ${actor ? sectionFields(this.sections) : ""}`;

  // Character: actor-specific pieces (only stat boxes for now, so only with a system that has them)
  const character = hasStats ? `
    <p class="hint nex-settings-scope"><i class="fa-solid fa-users"></i> Shared for ${owner}</p>
    ${statFields(actor)}` : "";

  const tabs = [
    { id: "general", label: "General", icon: "fa-solid fa-sliders", html: general },
    { id: "appearance", label: "Appearance", icon: "fa-solid fa-palette", html: appearance },
    ...(hasStats ? [{ id: "character", label: "Character", icon: "fa-solid fa-user-shield", html: character }] : [])
  ];
  const open = tabs.some(t => t.id === lastSettingsTab) ? lastSettingsTab : "general";
  const content = `
    <nav class="nex-settings-tabs">${tabs.map(t => `
      <button type="button" class="nex-settings-tab ${t.id === open ? "active" : ""}" data-settings-tab="${t.id}">
        <i class="${t.icon}" inert></i> ${t.label}
      </button>`).join("")}
    </nav>
    ${tabs.map(t => `<section class="nex-settings-panel" data-settings-panel="${t.id}" ${t.id === open ? "" : "hidden"}>
      ${t.html}</section>`).join("")}`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Nexus Hotbar Settings", icon: "fa-solid fa-gear" },
    classes: ["nexus-settings-dialog"],
    position: { width: 420 },
    content,
    render: (event, dialog) => {
      const root = dialog.element;
      for ( const out of root.querySelectorAll(".nex-range-value[data-for]") ) {
        const range = root.querySelector(`input[name="${out.dataset.for}"]`);
        range?.addEventListener("input", () => out.textContent = `${range.value}%`);
      }
      root.querySelector(".nex-accent-reset")?.addEventListener("click", () => {
        root.querySelector("input[name=accentColor]").value = DEFAULT_ACCENT;
      });
      root.querySelectorAll("[data-settings-tab]").forEach(btn => btn.addEventListener("click", () => {
        lastSettingsTab = btn.dataset.settingsTab;
        root.querySelectorAll("[data-settings-tab]").forEach(b => b.classList.toggle("active", b === btn));
        root.querySelectorAll("[data-settings-panel]").forEach(p => {
          p.hidden = p.dataset.settingsPanel !== lastSettingsTab;
        });
        dialog.setPosition({ height: "auto" });
      }));
    },
    buttons: [
      {
        action: "save",
        label: "Save",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const els = button.form.elements;
          return {
            columns: Number(els.columns.value),
            slotSize: Number(els.slotSize.value),
            show: els.show_effects
              ? Object.fromEntries(Object.keys(availableSections()).map(key => [key, !!els[`show_${key}`]?.checked]))
              : null,
            confirmEffects: els.confirmEffects ? els.confirmEffects.checked : null,
            turnAlert: els.turnAlert?.value ?? null,
            startTab: els.startTab?.value ?? null,
            barScale: Number(els.barScale?.value),
            accentColor: els.accentColor?.value ?? null,
            idleFade: els.idleFade?.value ?? null,
            idleOpacity: Number(els.idleOpacity?.value),
            stats: els.res0 ? Array.from({ length: statCount() }, (_, i) => els[`res${i}`]?.value || null) : null
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !result || (typeof result !== "object") ) return;

  const cols = Math.clamp(Math.round(result.columns) || columns, 5, 20);
  const size = Math.clamp(Math.round(result.slotSize / 2) * 2 || slotSize, 32, 72);
  const layout = { columns: cols, slotSize: size };
  // Sections this system doesn't have keep whatever was saved for them (e.g. by another system module)
  if ( result.show ) layout.show = { ...(doc.getFlag(MODULE, "bar")?.layout?.show ?? {}), ...result.show };
  if ( result.confirmEffects !== null ) layout.confirmEffects = result.confirmEffects;
  const scale = Math.clamp(Math.round((result.barScale || barScale) / 5) * 5, 50, 150);
  if ( scale !== barScale ) await game.settings.set(MODULE, "barScale", scale);
  const color = validColor(result.accentColor);
  if ( color && (color !== accentColor) ) await game.settings.set(MODULE, "accentColor", color);
  if ( (result.idleFade in IDLE_FADES) && (result.idleFade !== idleFade) ) {
    await game.settings.set(MODULE, "idleFade", result.idleFade);
  }
  const opacity = Math.clamp(Math.round((result.idleOpacity || idleOpacity) / 5) * 5, 10, 90);
  if ( opacity !== idleOpacity ) await game.settings.set(MODULE, "idleOpacity", opacity);
  if ( (result.startTab in START_TABS) && (result.startTab !== startTab) ) {
    await game.settings.set(MODULE, "startTab", result.startTab);
  }
  if ( (result.turnAlert in TURN_ALERTS) && (result.turnAlert !== turnAlert) ) {
    await game.settings.set(MODULE, "turnAlert", result.turnAlert);
  }
  await doc.update({ [`flags.${MODULE}.bar.layout`]: layout });

  if ( actor && result.stats ) {
    const before = readStats(actor);
    if ( result.stats.some((k, i) => k !== before[i]) ) await writeStats(actor, result.stats);
  }
  this.refresh();
}
