import { baseSpellEffect } from "../specialSpells.js";

export function divineFavorEffect(document) {
  let effect = baseSpellEffect(document, document.name);
  effect.changes.push(
    { key: "data.bonuses.mwak.damage", value: "1d4[Radiant]", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, priority: 0 },
    { key: "data.bonuses.rwak.damage", value: "1d4[Radiant]", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, priority: 0 }
  );
  document.effects.push(effect);

  return document;
}
