import { baseSpellEffect, generateMacroChange, generateMacroFlags } from "../specialSpells.js";

// this one is a bit different, the macro is triggered by midi-qol and applies effects to the actor
// the Marked effect gets applied to the target
export function huntersMarkEffect(document) {
  let effect = baseSpellEffect(document, "Marked");

  const itemMacroText = `
// Hunters mark onUse macro
if (args[0].hitTargets.length === 0) return;
if (args[0].tag === "OnUse") {
    // Sample Hunters mark
    let targetUuid = args[0].hitTargets[0].uuid;
    let actor = await MidiQOL.MQfromActorUuid(args[0].actorUuid); // actor who cast the spell

    if (!actor || !targetUuid) {
      console.error("Hunter's Mark: no token/target selected");
      return;
    }

    const effectData = {
      changes: [
        {key: "flags.midi-qol.huntersMark", mode: 5, value: targetUuid, priority: 20}, // who is marked
        {key: "flags.dnd5e.DamageBonusMacro", mode: 0, value: \`ItemMacro.\${args[0].item.name}\`, priority: 20} // macro to apply the damage
      ],
      origin: args[0].itemUuid,
      disabled: false,
      duration: args[0].item.effects[0].duration,
      icon: args[0].item.img,
      label: args[0].item.name
    }
    effectData.duration.startTime = game.time.worldTime;
    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
} else if (args[0].tag === "DamageBonus") {
    // only weapon attacks
    if (!["mwak","rwak"].includes(args[0].item.data.actionType)) return {};
    let targetUuid = args[0].hitTargets[0].uuid;
    // only on the marked target
    if (targetUuid !== getProperty(args[0].actor.flags, "midi-qol.huntersMark")) return {};
    const damageType = args[0].item.data.damage.parts[0][1];
    const diceMult = args[0].isCritical ? 2: 1;
    return {damageRoll: \`\${diceMult}d6[\${damageType}]\`, flavor: "Hunters Mark Damage"}
}
`;

  setProperty(document, "flags.itemacro", generateMacroFlags(document, itemMacroText));
  setProperty(document, "flags.midi-qol.onUseMacroName", "[postActiveEffects]ItemMacro");
  setProperty(document, "data.actionType", "util");

  document.effects.push(effect);

  let midiQOLSettings = game.settings.get("midi-qol", "ConfigSettings");

  if (!midiQOLSettings.allowUseMacro) {
    console.warn("Setting midi-qol use macro to true");
    midiQOLSettings.allowUseMacro = true;
    game.settings.set("midi-qol", "ConfigSettings", midiQOLSettings);
  }

  return document;
}
