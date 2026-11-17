# Nexus Hotbar

A replacement hotbar for **Foundry VTT v14**. It turns the core macro bar into a full action bar for the selected character: tabs of items, adjustable rows, drag and drop, right-click auto-fill, active effects, a portrait, combat controls and more.

This is the hub. It works with any game system, but the parts that need to know about your system's data (tabs, spell levels and uses, hit points, stats, rests, a weapon loadout...) come from a system module. Install the one for your system alongside it:

| System | Module |
| --- | --- |
| D&D 5e | Nexus Hotbar for D&D 5e (`nexus-hotbar-dnd5e`) |

Without a system module the bar still works, with one **Items** tab of the character's items, the macro bar, active effects, combat controls and the portrait image.

## Installation

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://github.com/SlamHammerfist/nexus-hotbar/releases/latest/download/module.json
```

Then install the system module for your game system (for D&D 5e, Nexus Hotbar for D&D 5e) and enable both in your world's **Manage Modules**.

## Features

### Action slots
- **Tabs** from your system module, each with its own layout (one Items tab without one).
- **Adjustable rows** (1 to 6) with the **+ / −** buttons; slots per row and slot size in settings.
- **Right-click a slot** to Use, Open Sheet, Remove, **Auto-fill** the row or all rows, or clear them.
- **Drag and drop** items from the character sheet, macros, or other documents onto slots; drag slots to swap them.
- Badges for levels, charges or quantity, a coloured dot for the action type, and greyed-out slots, when your system module provides them.
- **Number keys 1–0** trigger the first row.
- With no token selected and no assigned character, the bar is a plain macro grid.

### Activation filter
If your system module defines activation types (for D&D 5e: Action, Bonus Action, Reaction), toggle their buttons to highlight just those slots. While a filter is on, auto-fill only adds that type.

### Active effects
Conditions and timed effects on the character appear in the header. **Right-click** to remove one (optionally with a confirmation).

### Portrait
The token image. **Click** to open the sheet. System modules can add a health bar, death saves and a right-click action.

### Combat
In combat the rest buttons (if your system has them) become **Roll Initiative**, then an **hourglass** while you wait, then **End Turn** on your turn. Optional **your-turn alert**: a sound and/or a flash of the bar.

### From system modules
Passive features, a loadout column, stat boxes and rest buttons show only when the system module supplies them.

## Settings

Click the **gear** on the bar. Settings are split into tabs:

| Tab | Settings |
|---|---|
| **General** | Starting tab, your-turn alert, confirm before removing effects |
| **Appearance** | Bar scale, accent colour, fade when idle, slots per row, slot size, show/hide each section |
| **Character** | Which stats the stat boxes show (when the system module has stats) |

Settings marked **Just for you** are saved on your Foundry user. Settings marked **Shared** are saved on the character, so the player and the GM see the same bar.

To switch back to Foundry's normal hotbar on one computer, turn off **Use Nexus Hotbar** in **Configure Settings → Nexus Hotbar** (requires a reload).

## Writing a system module

Register with the hub when it is ready. The hook fires at `setup`, before the bar first renders. Everything except `id` is optional; leave a part out and that part of the bar just doesn't show (or falls back to the plain behaviour noted below).

```js
Hooks.once("nexusHotbar.ready", api => {
  api.registerSystem({
    // Only used when game.system.id matches.
    id: "mysystem",

    // Actor tabs, in display order. Each slot layout is saved per tab id.
    // Icon: `icon` (Font Awesome classes), `img` (drawn as a mask in the text colour) or `html`.
    // `default` is the tab a bar opens on before one is picked (else the first).
    // Default: one "Items" tab.
    tabs: {
      actions: { label: "Actions", icon: "fa-solid fa-hand-fist", default: true },
      spells: { label: "Spells", img: "systems/mysystem/icons/spellbook.svg" }
    },

    // Activation types for the highlight filter and the coloured dot on each slot.
    activations: {
      types: {
        one: { label: "One Action", icon: "fa-solid fa-1", color: "#4caf50" },
        reaction: { label: "Reaction", icon: "fa-solid fa-bolt", color: "#b36bff" }
      },
      of: item => new Set([item.system.actionType?.value])
    },

    // Items auto-fill adds to a tab, in order. Default: all the actor's items by name.
    autoFill: (actor, tab) => actor.items.filter(i => i.type === (tab === "spells" ? "spell" : "action")),

    // Badges on a slot: level (top left), count (bottom right), and greyed out when depleted.
    slotInfo: item => ({ count: item.system.uses?.value, depleted: item.system.uses?.value === 0 }),

    // Clicking a slot. Default: item.use({ event }) if the item has it, else open its sheet.
    use: (item, event) => item.toMessage(),

    // Rich item tooltip: { html, cssClass }, or null for just the name.
    tooltip: item => null,

    // Passive features frame, with a chooser dialog grouped by heading.
    passives: {
      label: "Passive Features",
      candidates: actor => actor.items.filter(i => i.type === "feat"),
      group: item => item.system.category ?? "Features",
      show: (item, event) => item.toMessage()            // default: open the sheet
    },

    // A column of boxes left of the slots (e.g. a weapon loadout). The hub draws the boxes;
    // `prepare` returns [{ slot, img, name, cssClass?, uuid? }] and the rest handle input.
    loadout: {
      label: "Weapon Loadout",
      prepare: actor => [],
      menuOptions: bar => [],                            // ContextMenu entries; li.dataset.slot is the box
      click: (bar, event, box) => {},
      drop: (bar, event, box) => {}
    },

    // Health bar and death saves on the portrait, and a right-click action.
    portrait: {
      // hp:    { value, max, temp, tempmax ("+5" or ""), tempmaxClass, pct }
      // death: { success: [bool x3], failure: [bool x3], stable, dead }
      prepare: actor => ({ hp: { value: 10, max: 20, temp: 0, tempmax: "", tempmaxClass: "", pct: 50 } }),
      setHp: (actor, field, text) => {},                 // field "hp" or "temp"; return false if invalid
      deathSave: (actor, event) => {},
      setDeathSave: (actor, kind, index) => {},          // kind "success" or "failure"
      roll: (bar, event) => {},                          // right-click the portrait
      rollHint: "roll a check"                           // shown in the portrait tooltip
    },

    // Stat boxes left of the portrait. The player picks a key per box.
    stats: {
      count: 3,
      defaults: ["ac", "perception"],
      options: actor => [{ key: "ac", label: "Armor Class", group: "Defense" }],
      read: (actor, key) => ({ label: "Armor Class", short: "AC", icon: "fa-solid fa-shield",
        value: "18", tooltip: "Armor Class", roll: event => {} })   // roll is optional
    },

    // Buttons shown above the row controls when out of combat.
    rests: [
      { id: "rest", label: "Rest", icon: "fa-solid fa-bed", run: actor => actor.rest() }
    ],

    // The Roll Initiative button. Default: combat.rollInitiative for the combatant.
    rollInitiative: (actor, combatant, event) => combatant.combat.rollInitiative([combatant.id])
  });
});
```

The hub is also at `game.modules.get("nexus-hotbar").api` once Foundry has initialised. Besides `registerSystem` it has `system` (the active registration), `useDocument(doc, event)` (use an item or run a macro the way a slot does), `tooltipAttributes(item, direction)` (tooltip attributes for an item in a dialog list) and `refresh()` (re-render the bar). Save anything you keep on the actor under the hub's flag scope, `flags.nexus-hotbar.bar.*`, so it travels with the rest of the layout.

The health bar can be restyled with `--nex-hp-1` / `--nex-hp-2` (fill gradient), `--nex-hp-gold` (edges), `--nex-hp-track`, `--nex-hp-font` and `--nex-hp-temp` on `#hotbar.nexus-hotbar`.

## Compatibility

- Foundry VTT **v14**
- Any game system; a Nexus Hotbar system module for the full bar

## Reporting issues

Please open an issue at <https://github.com/SlamHammerfist/nexus-hotbar/issues>.
