# Nexus Hotbar

A replacement hotbar for **Foundry VTT v14** and the **D&D 5e** system (5.0+). It turns the core macro bar into a full action bar for the selected character: tabs for inventory, features and spells, a weapon loadout, a portrait with an editable health bar, quick stats, combat controls and more.

## Installation

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://github.com/SlamHammerfist/nexus-hotbar/releases/latest/download/module.json
```

Then enable **Nexus Hotbar** in your world's **Manage Modules**.

## Features

### Action slots
- **Three tabs**: Inventory, Features and Spells, each with its own layout.
- **Adjustable rows** (1 to 6) with the **+ / −** buttons; slots per row and slot size in settings.
- **Right-click a slot** to Use, Open Sheet, Remove, **Auto-fill** the row or all rows, or clear them.
  - Auto-fill picks equipped weapons and usable items, active features, or castable spells.
- **Drag and drop** items from the character sheet, macros, or other documents onto slots; drag slots to swap them.
- Slots show spell level, charges or quantity, a coloured dot for the action type, and grey out when used up or unprepared.
- **Number keys 1–0** trigger the first row.

### Action / Bonus Action / Reaction filter
Toggle the **circle / triangle / arrows** buttons to highlight just those actions. While a filter is on, auto-fill only adds that type.

### Passive features
Click the **shield** to choose which passive features to show. Click one to post it to chat; right-click for more.

### Active effects
Conditions and timed effects on the character appear in the header. **Right-click** to remove one (optionally with a confirmation).

### Weapon loadout
A three-box column: **main hand**, **off hand**, and **Unarmed Strike**.
- Two-handed weapons fill both hands; shields go in the off hand.
- Pick a weapon from the right-click menu, by clicking an empty hand, or by dragging one from the sheet. Equipping and unequipping updates the character sheet.

### Portrait
- The token image. **Click** to open the sheet; **right-click** to roll any ability check, saving throw or skill.
- **Health bar** styled like the character sheet. Click HP or TMP to edit: type a number, or `+5` / `-5`. Damage comes out of temp HP first.
- At **0 HP**, death save pips and a roll button appear.

### Stat boxes
Three boxes beside the portrait showing any stat you choose: AC, speed, initiative, proficiency, spell save DC, passive scores, skills, ability checks or saves. Rollable ones roll on click.

### Rest and combat
- **Short Rest** and **Long Rest** buttons.
- In combat they become **Roll Initiative**, then an **hourglass** while you wait, then **End Turn** on your turn.
- Optional **your-turn alert**: a sound and/or a flash of the bar.

## Settings

Click the **gear** on the bar. Settings are split into tabs:

| Tab | Settings |
|---|---|
| **General** | Starting tab, your-turn alert, confirm before removing effects |
| **Appearance** | Bar scale, accent colour, fade when idle, slots per row, slot size, show/hide each section |
| **Character** | Which stats the three stat boxes show |

Settings marked **Just for you** are saved on your Foundry user. Settings marked **Shared** are saved on the character, so the player and the GM see the same bar.

To switch back to Foundry's normal hotbar on one computer, turn off **Use Nexus Hotbar** in **Configure Settings → Nexus Hotbar** (requires a reload).

## Compatibility

- Foundry VTT **v14**
- D&D 5e system **5.0** or later

## Reporting issues

Please open an issue at <https://github.com/SlamHammerfist/nexus-hotbar/issues>.
