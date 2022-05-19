import utils from "../utils.js";
import logger from "../logger.js";
import DICTIONARY from "../dictionary.js";
import { updateIcons, getImagePath, getCompendiumItems, getSRDIconLibrary, copySRDIcons, copySupportedItemFlags, compendiumFolders } from "./import.js";
import { getCompendiumType, munchNote } from "./utils.js";
import { migrateItemsDAESRD } from "./dae.js";

var compendiumLoaded = false;
var monsterCompendium;

/**
 *
 * @param {[string]} items Array of Strings or
 */
async function retrieveCompendiumItems(items, compendiumName) {
  const GET_ENTITY = true;

  const itemNames = items.map((item) => {
    if (typeof item === "string") return item;
    if (typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "name")) return item.name;
    return "";
  });

  const results = await utils.queryCompendiumEntries(compendiumName, itemNames, GET_ENTITY);
  const cleanResults = results.filter((item) => item !== null);

  return cleanResults;
}


/**
 *
 * @param {[items]} spells Array of Strings or items
 */
async function retrieveSpells(spells) {
  const compendiumName = await game.settings.get("ddb-importer", "entity-spell-compendium");
  const compendiumItems = await retrieveCompendiumItems(spells, compendiumName);
  const itemData = compendiumItems.map((i) => {
    let spell = i.toObject();
    delete spell._id;
    return spell;
  });

  return itemData;
}

function getMonsterCompendium() {
  if (compendiumLoaded) return monsterCompendium;
  monsterCompendium = getCompendiumType("monster", false);
  if (monsterCompendium) {
    // eslint-disable-next-line require-atomic-updates
    compendiumLoaded = true;
    return monsterCompendium;
  }
  return undefined;
}

export function checkMonsterCompendium() {
  compendiumLoaded = false;
  monsterCompendium = undefined;
  return getMonsterCompendium();
}

async function addNPCToCompendium(npc) {
  const compendium = getMonsterCompendium();
  if (compendium) {
    let npcBasic = duplicate(npc);
    // delete npcBasic.items;
    let npcItems = npc.items;
    // v8 doesn't like null _ids with keepId set
    if (!game.version) {
      npcItems = npcItems.map((i) => {
        if (!i._id) i._id = randomID();
        if (i.effects && i.effects.length > 0) {
          i.effects = i.effects.map((e) => {
            if (!e._id) e._id = randomID();
            return e;
          });
        }
        return i;
      });
    }

    // unlock the compendium for update/create
    compendium.configure({ locked: false });
    const monsterIndexFields = ["name", "flags.ddbimporter.id"];

    const index = await compendium.getIndex({ fields: monsterIndexFields });
    const npcMatch = index.contents.find((entity) =>
      entity.flags?.ddbimporter?.id &&
      entity.name.toLowerCase() === npcBasic.name.toLowerCase() &&
      entity.flags.ddbimporter.id == npcBasic.flags.ddbimporter.id
    );

    let compendiumNPC;
    if (npcMatch) {
      if (game.settings.get("ddb-importer", "munching-policy-update-existing")) {
        const existingNPC = await compendium.getDocument(npcMatch._id);

        const updateImages = game.settings.get("ddb-importer", "munching-policy-update-images");
        if (!updateImages && existingNPC.data.img !== "icons/svg/mystery-man.svg") {
          npcBasic.img = existingNPC.data.img;
        }
        if (!updateImages && existingNPC.data.token.img !== "icons/svg/mystery-man.svg") {
          npcBasic.token.img = existingNPC.data.token.img;
          npcBasic.token.scale = existingNPC.data.token.scale;
          npcBasic.token.randomImg = existingNPC.data.token.randomImg;
          npcBasic.token.mirrorX = existingNPC.data.token.mirrorX;
          npcBasic.token.mirrorY = existingNPC.data.token.mirrorY;
          npcBasic.token.lockRotation = existingNPC.data.token.lockRotation;
          npcBasic.token.rotation = existingNPC.data.token.rotation;
          npcBasic.token.alpha = existingNPC.data.token.alpha;
          npcBasic.token.lightAlpha = existingNPC.data.token.lightAlpha;
          npcBasic.token.lightAnimation = existingNPC.data.token.lightAnimation;
          npcBasic.token.tint = existingNPC.data.token.tint;
          npcBasic.token.lightColor = existingNPC.data.token.lightColor;
        }

        const retainBiography = game.settings.get("ddb-importer", "munching-policy-monster-retain-biography");
        if (retainBiography) {
          npcBasic.data.details.biography = existingNPC.data.data.details.biography;
        }

        npcBasic._id = npcMatch._id;
        await copySupportedItemFlags(existingNPC.toObject(), npcBasic);

        // remove and re-add items
        await existingNPC.deleteEmbeddedDocuments("Item", [], { deleteAll: true });
        logger.debug("New npcItems", duplicate(npcItems));
        await existingNPC.createEmbeddedDocuments("Item", npcItems, { keepId: true });
        delete npcBasic.items;

        logger.debug("NPC Core data", duplicate(npcBasic));
        compendiumNPC = await existingNPC.update(npcBasic, { pack: compendium.name });
        if (!compendiumNPC) {
          logger.debug("No changes made to base character", npcBasic);
        }
      }
    } else {
      // create the new npc
      logger.debug(`Creating NPC actor ${npcBasic.name}`);
      const options = {
        temporary: true,
        displaySheet: false,
      };
      delete npcBasic.items;
      logger.debug("NPC", duplicate(npcBasic));
      const newNPC = await Actor.create(npcBasic, options);
      logger.debug("npcItems", duplicate(npcItems));
      compendiumNPC = await compendium.importDocument(newNPC);
      await compendiumNPC.createEmbeddedDocuments("Item", npcItems, { keepId: true });
    }

    // using compendium folders?
    if (compendiumNPC) await compendiumFolders(compendiumNPC, "npc");
  } else {
    logger.error("Error opening compendium, check your settings");
  }
}

export async function addNPCDDBId(npc) {
  let npcBasic = duplicate(npc);
  const compendium = getMonsterCompendium();
  if (compendium) {
    // unlock the compendium for update/create
    compendium.configure({ locked: false });
    const monsterIndexFields = ["name", "flags.ddbimporter.id"];

    const index = await compendium.getIndex({ fields: monsterIndexFields });
    const npcMatch = index.contents.find((entity) =>
      !hasProperty(entity, "flags.ddbimporter.id") &&
      entity.name.toLowerCase() === npcBasic.name.toLowerCase()
    );

    if (npcMatch) {
      if (game.settings.get("ddb-importer", "munching-policy-update-existing")) {
        const existingNPC = await compendium.getDocument(npcMatch._id);
        const updateDDBData = {
          _id: npcMatch._id,
          "flags.ddbimporter.id": npcBasic.flags.ddbimporter.id,
        };
        logger.debug("NPC Update Data", duplicate(updateDDBData));
        await existingNPC.update(updateDDBData);
      }
    }
  } else {
    logger.error("Error opening compendium, check your settings");
  }
}


async function getNPCImage(data) {
  // check to see if we have munched flags to work on
  if (!data.flags || !data.flags.monsterMunch || !data.flags.monsterMunch.img) {
    return false;
  }

  const updateImages = game.settings.get("ddb-importer", "munching-policy-update-images");
  if (!updateImages && data.img !== "icons/svg/mystery-man.svg") {
    return false;
  }

  let dndBeyondImageUrl = data.flags.monsterMunch.img;
  let dndBeyondTokenImageUrl = data.flags.monsterMunch.tokenImg;
  const useAvatarAsToken = game.settings.get("ddb-importer", "munching-policy-use-full-token-image");
  const useTokenAsAvatar = game.settings.get("ddb-importer", "munching-policy-use-token-avatar-image");
  if (useAvatarAsToken) {
    dndBeyondTokenImageUrl = dndBeyondImageUrl;
  } else if (useTokenAsAvatar) {
    dndBeyondImageUrl = dndBeyondTokenImageUrl;
  }

  const npcType = data.data.details.type.value;
  const genericNPCName = npcType.replace(/[^a-zA-Z]/g, "-").replace(/-+/g, "-").trim();
  const npcName = data.name.replace(/[^a-zA-Z]/g, "-").replace(/-+/g, "-").trim();

  if (!dndBeyondImageUrl && dndBeyondTokenImageUrl) dndBeyondImageUrl = dndBeyondTokenImageUrl;
  if (!dndBeyondTokenImageUrl && dndBeyondImageUrl) dndBeyondTokenImageUrl = dndBeyondImageUrl;

  if (dndBeyondImageUrl) {
    const ext = dndBeyondImageUrl.split(".").pop().split(/#|\?|&/)[0];

    if (dndBeyondImageUrl.endsWith(npcType + "." + ext)) {
      // eslint-disable-next-line require-atomic-updates
      data.img = await getImagePath(dndBeyondImageUrl, "npc-generic", genericNPCName);
    } else {
      // eslint-disable-next-line require-atomic-updates
      data.img = await getImagePath(dndBeyondImageUrl, "npc", npcName);
    }
  }

  // Currently token images always have to be downloaded. Not sure why.
  if (dndBeyondTokenImageUrl) {
    const tokenExt = dndBeyondTokenImageUrl.split(".").pop().split(/#|\?|&/)[0];

    if (dndBeyondTokenImageUrl.endsWith(npcType + "." + tokenExt)) {
      // eslint-disable-next-line require-atomic-updates
      data.token.img = await getImagePath(dndBeyondTokenImageUrl, "npc-generic-token", genericNPCName, true, false);
    } else {
      // eslint-disable-next-line require-atomic-updates
      data.token.img = await getImagePath(dndBeyondTokenImageUrl, "npc-token", npcName, true, false);
    }
  }

  // check avatar, if not use token image
  // eslint-disable-next-line require-atomic-updates
  if (!data.img && data.token.img) data.img = data.token.img;

  // final check if image comes back as null
  // eslint-disable-next-line require-atomic-updates
  if (data.img === null) data.img = "icons/svg/mystery-man.svg";
  // eslint-disable-next-line require-atomic-updates
  if (data.token.img === null) data.token.img = "icons/svg/mystery-man.svg";

  return true;
}

function getSpellEdgeCase(spell, type, spellList) {
  const edgeCases = spellList.edgeCases;
  const edgeCase = edgeCases.find((edge) => edge.name.toLowerCase() === spell.name.toLowerCase() && edge.type === type);

  if (edgeCase) {
    logger.debug(`Spell edge case for ${spell.name}`);
    switch (edgeCase.edge.toLowerCase()) {
      case "self":
      case "self only":
        spell.data.target.type = "self";
        logger.debug("spell target changed to self");
        break;
      // no default
    }
    spell.name = `${spell.name} (${edgeCase.edge})`;
    spell.data.description.chat = `<p><b>Special Notes: ${edgeCase.edge}.</b></p>\n\n${spell.data.description.chat}`;
    spell.data.description.value = `<p><b>Special Notes: ${edgeCase.edge}.</b></p>\n\n${spell.data.description.value}`;

    const diceSearch = /(\d+)d(\d+)/;
    const diceMatch = edgeCase.edge.match(diceSearch);
    if (diceMatch) {
      if (spell.data.damage.parts[0] && spell.data.damage.parts[0][0]) {
        spell.data.damage.parts[0][0] = diceMatch[0];
      } else if (spell.data.damage.parts[0]) {
        spell.data.damage.parts[0] = [diceMatch[0]];
      } else {
        spell.data.damage.parts = [[diceMatch[0]]];
      }
    }

    // save DC 12
    const saveSearch = /save DC (\d+)/;
    const saveMatch = edgeCase.edge.match(saveSearch);
    if (saveMatch) {
      spell.data.save.dc = saveMatch[1];
      spell.data.save.scaling = "flat";
    }

  }

  // remove material components?
  if (!spellList.material) {
    spell.data.materials = {
      value: "",
      consumed: false,
      cost: 0,
      supply: 0
    };
    spell.data.components.material = false;
  }

}

async function addSpells(data) {
  // check to see if we have munched flags to work on
  if (!data.flags || !data.flags.monsterMunch || !data.flags.monsterMunch.spellList) {
    return;
  }

  const spellList = data.flags.monsterMunch.spellList;
  logger.debug(`Spell List for edgecases`, spellList);
  const atWill = spellList.atwill;
  const klass = spellList.class;
  const innate = spellList.innate;
  const pact = spellList.pact;

  if (atWill.length !== 0) {
    logger.debug("Retrieving at Will spells:", atWill);
    let spells = await retrieveSpells(atWill);
    spells = spells.filter((spell) => spell !== null).map((spell) => {
      if (spell.data.level == 0) {
        spell.data.preparation = {
          mode: "prepared",
          prepared: false,
        };
      } else {
        spell.data.preparation = {
          mode: "atwill",
          prepared: false,
        };
        spell.data.uses = {
          value: null,
          max: null,
          per: "",
        };
      }
      getSpellEdgeCase(spell, "atwill", spellList);
      return spell;
    });
    // eslint-disable-next-line require-atomic-updates
    data.items = data.items.concat(spells);
  }

  // class spells
  if (klass.length !== 0) {
    logger.debug("Retrieving class spells:", klass);
    let spells = await retrieveSpells(klass);
    spells = spells.filter((spell) => spell !== null).map((spell) => {
      spell.data.preparation = {
        mode: "prepared",
        prepared: true,
      };
      getSpellEdgeCase(spell, "class", spellList);
      return spell;
    });
    // eslint-disable-next-line require-atomic-updates
    data.items = data.items.concat(spells);
  }

  // pact spells
  if (pact.length !== 0) {
    logger.debug("Retrieving pact spells:", pact);
    let spells = await retrieveSpells(pact);
    spells = spells.filter((spell) => spell !== null).map((spell) => {
      spell.data.preparation = {
        mode: "pact",
        prepared: true,
      };
      getSpellEdgeCase(spell, "pact", spellList);
      return spell;
    });
    // eslint-disable-next-line require-atomic-updates
    data.items = data.items.concat(spells);
  }

  // innate spells
  if (innate.length !== 0) {
    // innate:
    // {name: "", type: "srt/lng/day", value: 0}
    logger.debug("Retrieving innate spells:", innate);
    const spells = await retrieveSpells(innate);
    const innateSpells = spells.filter((spell) => spell !== null)
      .map((spell) => {
        const spellInfo = innate.find((w) => w.name.toLowerCase() == spell.name.toLowerCase());
        if (spellInfo) {
          const isAtWill = hasProperty(spellInfo, "innate") && !spellInfo.innate;
          if (spell.data.level == 0) {
            spell.data.preparation = {
              mode: "prepared",
              prepared: false,
            };
          } else {
            spell.data.preparation = {
              mode: isAtWill ? "atwill" : "innate",
              prepared: !isAtWill,
            };
          }
          if (isAtWill && spellInfo.type === "atwill") {
            spell.data.uses = {
              value: null,
              max: null,
              per: "",
            };
          } else {
            const perLookup = DICTIONARY.resets.find((d) => d.id == spellInfo.type);
            const per = spellInfo.type === "atwill"
              ? null
              : (perLookup && perLookup.type)
                ? perLookup.type
                : "day";
            spell.data.uses = {
              value: spellInfo.value,
              max: spellInfo.value,
              per: per,
            };
          }
          getSpellEdgeCase(spell, "innate", spellList);
        }
        return spell;
      });
    // eslint-disable-next-line require-atomic-updates
    data.items = data.items.concat(innateSpells);
  }
}

async function swapItems(data) {
  const swap = game.settings.get("ddb-importer", "munching-policy-monster-items");

  if (swap) {
    logger.debug("Replacing items...");
    // console.info(data.items);
    const getItemOptions = {
      monsterMatch: true,
    };
    const updatedItems = await getCompendiumItems(data.items, "inventory", getItemOptions);
    const itemsToRemove = updatedItems.map((item) => {
      logger.debug(`${item.name} to ${item.flags.ddbimporter.originalItemName}`);
      return { name: item.flags.ddbimporter.originalItemName, type: item.type };
    });
    logger.debug("Swapping items", itemsToRemove);
    // console.warn(itemsToRemove);
    const lessUpdatedItems = data.items.filter((item) =>
      !itemsToRemove.some((target) => item.name === target.name && item.type === target.type)
    );
    // console.log(lessUpdatedItems);
    const newItems = lessUpdatedItems.concat(updatedItems);
    // console.error(newItems);
    // eslint-disable-next-line require-atomic-updates
    data.items = newItems;

  }
}

async function linkResourcesConsumption(actor) {
  if (actor.items.some((item) => item.data?.recharge?.value)) {
    logger.debug(`Resource linking for ${actor.name}`);
    actor.items.forEach((item) => {
      if (item.data?.recharge?.value) {
        const itemID = randomID(16);
        item._id = itemID;
        if (item.type === "weapon") item.type = "feat";
        item.data.consume = {
          type: "charges",
          target: itemID,
          amount: null,
        };
      }
    });
  }
  return actor;
}

// async function buildNPC(data, srdIconLibrary, iconMap) {
export async function buildNPC(data, temporary = true, update = false, handleBuild = false) {
  logger.debug("Importing Images");
  await getNPCImage(data);
  logger.debug("Importing Spells");
  await addSpells(data);
  logger.debug("Checking Items");
  await swapItems(data);

  // DAE
  const daeInstalled = utils.isModuleInstalledAndActive("dae") &&
    (utils.isModuleInstalledAndActive("Dynamic-Effects-SRD") || utils.isModuleInstalledAndActive("midi-srd"));
  const daeCopy = game.settings.get("ddb-importer", "munching-policy-dae-copy");
  if (daeInstalled && daeCopy) {
    munchNote(`Importing DAE Item for ${data.name}`);
    // eslint-disable-next-line require-atomic-updates
    data.items = await migrateItemsDAESRD(data.items);
  }

  logger.debug("Importing Icons");
  // eslint-disable-next-line require-atomic-updates
  data.items = await updateIcons(data.items, false, true, data.name);
  data = await linkResourcesConsumption(data);

  if (handleBuild) {
    // create the new npc
    logger.debug("Creating NPC actor");
    const options = {
      temporary: temporary,
      displaySheet: false,
    };
    if (update) {
      const npc = game.actors.get(data._id);
      await npc.deleteEmbeddedDocuments("Item", [], { deleteAll: true });
      await Actor.updateDocuments([data]);
      return npc;
    } else {
      const npc = await Actor.create(data, options);
      return npc;
    }

  } else {
    return data;
  }

}

async function parseNPC (data) {
  let npc = await buildNPC(data);
  logger.info(`Processing actor ${npc.name} for the compendium`);
  await addNPCToCompendium(npc);
  return npc;
}

export function addNPC(data) {
  return new Promise((resolve, reject) => {
    parseNPC(data)
      .then((npc) => {
        resolve(npc);
      })
      .catch((error) => {
        logger.error(`error parsing NPC: ${error} ${data.name}`);
        logger.error(error.stack);
        reject(error);
      });
  });
}

export async function generateIconMap(monsters) {
  let promises = [];

  const srdIcons = game.settings.get("ddb-importer", "munching-policy-use-srd-icons");
  // eslint-disable-next-line require-atomic-updates
  if (srdIcons) {
    const srdIconLibrary = await getSRDIconLibrary();
    munchNote(`Updating SRD Icons`, true);
    let itemMap = [];

    monsters.forEach((monster) => {
      munchNote(`Processing ${monster.name}`);
      promises.push(
        copySRDIcons(monster.items, srdIconLibrary, itemMap).then((items) => {
          monster.items = items;
        })
      );
    });
  }

  return Promise.all(promises);
}

export function copyExistingMonsterImages(monsters, existingMonsters) {
  const updated = monsters.map((monster) => {
    const existing = existingMonsters.find((m) => monster.name === m.name);
    if (existing) {
      monster.img = existing.img;
      monster.token.img = existing.token.img;
      return monster;
    } else {
      return monster;
    }
  });
  return updated;
}
