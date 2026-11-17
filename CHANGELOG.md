# Changelog

## 3.0.0

**Breaking:** Nexus Hotbar is now a system-agnostic hub. Everything specific to D&D 5e has moved to the new **Nexus Hotbar for D&D 5e** module (`nexus-hotbar-dnd5e`). D&D 5e users need to install and enable it alongside this module. Saved layouts, tabs and settings carry over unchanged.

### Added
- System module API: `Hooks.once("nexusHotbar.ready", api => api.registerSystem({ id, ... }))`, also at `game.modules.get("nexus-hotbar").api`. System modules supply tabs, activation types, auto-fill picks, slot badges, item use, tooltips, passives, a loadout column, the portrait's health bar and death saves, stat boxes, rest buttons and the initiative roll. See the README.
- Without a system module the bar shows one **Items** tab of the character's items, plus the macro bar, active effects, combat controls and the portrait image.
- Tab icons can be a Font Awesome icon, an image drawn in the text colour, or custom markup.

### Changed
- Sections that the system module doesn't supply are hidden, along with their show/hide checkbox; the **Character** settings tab only appears when there are stat boxes.
- Starting tab choices come from the system module's tabs.
- Activation colours (slot dot, filter highlight) come from the system module.
- Health bar colours use `--nex-hp-*` CSS variables with built-in fallbacks.
- No longer declares the dnd5e system as a relationship.

## 2.0.1

### Added
- **Remove Filter** button that clears all highlights.

### Changed
- Auto-fill no longer adds weapons; they live in the loadout column.
- Tabs use the dnd5e sheet icons (backpack, list, book), with no circle behind the selected tab.
- Filter icons: fist (Action), circle-plus (Bonus Action), bolt (Reaction).
- Removing a condition or timed effect asks for confirmation by default.
- A lone checkbox in the settings dialog now spans the full row.

## 2.0.0

Complete rewrite for Foundry VTT v14 and D&D 5e 5.0+. Layouts from 1.x are not carried over.

### Added
- **Action slots** with Inventory, Features and Spells tabs, 1 to 6 rows per tab, drag and drop, and right-click auto-fill and clear.
- **Action / Bonus Action / Reaction filter** that highlights matching slots and limits auto-fill to that type.
- **Passive features** frame with a chooser dialog.
- **Active effects** display with right-click removal.
- **Weapon loadout** with main hand, off hand (weapons or shields) and Unarmed Strike; two-handed weapons fill both hands.
- **Portrait** with a character-sheet-style health bar, editable HP and temp HP (damage uses temp HP first), death saves at 0 HP, and a right-click roll dialog for checks, saves and skills.
- **Stat boxes** for AC, speed, initiative, proficiency, spell save DC, passive scores, skills, checks and saves.
- **Short and long rest** buttons that become **Roll Initiative / waiting / End Turn** controls in combat.
- **Your-turn alert** with sound and/or flash.
- **Settings dialog** (gear button) with General, Appearance and Character tabs:
  - starting tab, your-turn alert, confirm before removing effects
  - bar scale, accent colour, fade when idle, slots per row, slot size, show/hide each section
  - stat box choices
- Shared settings saved on the character so the player and GM see the same bar; personal settings saved on each user.
- Number keys 1–0 trigger the first row.
