# Stonetop: The Party

A small floating window for the Stonetop system in Foundry VTT (v14) that shows the whole party at a glance.

Each row shows a player character's:

- Name, playbook and playbook emblem
- Armor and HP, with a bar that turns red at a third of max HP or less
- Load: Light, Normal, Heavy or Overloaded, as the Inventory tab works it out
- Debilities and open wounds, only when they have any

After death it follows the sheet: a character who takes an insert shows as Ghost, Revenant or Thrall with their old
playbook struck through, and a character who stepped through the Last Door carries the sheet's Dead tag.

## Using it

- Press **P** to open or close The Party. Change the key in **Configure Controls**.
- Drag it anywhere; it reopens where you left it.
- Click a row to open that character's sheet.
- It updates as characters change.

## Install

In Foundry: **Add-on Modules → Install Module**, and paste this into **Manifest URL**:

```
https://github.com/MrJamela/stonetop-party/releases/latest/download/module.json
```

Then turn it on in your world's **Manage Modules**.

Needs: the [Stonetop system](https://github.com/PrinceWitherdick/stonetop-pwd) (`stonetop-pwd`).
