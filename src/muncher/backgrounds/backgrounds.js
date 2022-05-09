import logger from "../../logger.js";
import { generateBackground } from "../../parser/character/bio.js";
import { parseTags } from "../../parser/templateStrings.js";
import utils from "../../utils.js";
import { updateCompendium, srdFiddling, daeFiddling } from "../import.js";
import { munchNote } from "../utils.js";
import { generateTable } from "../table.js";

const BACKGROUND_TEMPLATE = {
  "name": "",
  "type": "background",
  "data": {
    "description": {
      "value": "",
      "chat": "",
      "unidentified": ""
    },
    "source": "",
  },
  "sort": 2600000,
  "flags": {
    "ddbimporter": {},
    "obsidian": {
      "source": {
        "type": "background"
      }
    },
  },
  "img": "icons/skills/trades/academics-book-study-purple.webp",
};

function buildBase(data) {
  let result = JSON.parse(JSON.stringify(BACKGROUND_TEMPLATE));
  const bgData = generateBackground(data);
  result.name = data.name;
  result.data.description.value += `${bgData.description}\n\n`;

  result.flags.ddbimporter = {
    featId: data.id,
    version: CONFIG.DDBI.version,
  };

  result.data.source = utils.parseSource(data);
  result.data.description.value = parseTags(result.data.description.value);
  result.data.description.value = generateTable(result.name, result.data.description.value, true, "background");

  // console.warn(data.name, { data, bgData, result });

  return result;
}


function buildBackground(background) {
  let result = buildBase(background);

  return result;
}


export async function getBackgrounds(data) {
  logger.debug("get backgrounds started");
  const updateBool = game.settings.get("ddb-importer", "munching-policy-update-existing");

  let backgrounds = [];

  // console.warn(data);

  data.forEach((background) => {
    logger.debug(`${background.name} background parsing started...`);
    const parsedBackground = buildBackground(background);
    backgrounds.push(parsedBackground);
  });

  // console.warn("backgrounds", backgrounds);

  const fiddledBackgrounds = await srdFiddling(backgrounds, "backgrounds");
  const finalBackgrounds = await daeFiddling(fiddledBackgrounds);

  munchNote(`Importing ${finalBackgrounds.length} backgrounds!`, true);
  await updateCompendium("backgrounds", { backgrounds: finalBackgrounds }, updateBool);

  return finalBackgrounds;
}
