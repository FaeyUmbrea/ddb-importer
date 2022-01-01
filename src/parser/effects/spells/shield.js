import { baseSpellEffect } from "../specialSpells.js";

export function shieldEffect(document) {
  let effect = baseSpellEffect(document, document.name);
  effect.changes.push({
    key: "data.attributes.ac.bonus",
    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
    value: "+5",
    priority: "20",
  });
  document.effects.push(effect);

  return document;
}
