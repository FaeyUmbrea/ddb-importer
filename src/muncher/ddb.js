// Main module class
import logger from "../logger.js";
import { parseItems } from "./items.js";
import { parseSpells } from "./spells.js";
import { parseCritters } from "./monsters.js";

export default class DDBMuncher extends Application {
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.id = "ddb-importer-monsters";
    options.template = "modules/ddb-importer/src/muncher/ddb_munch.handlebars";
    options.classes.push("ddb-muncher");
    options.resizable = false;
    options.height = "auto";
    options.width = 400;
    options.minimizable = true;
    options.title = "MrPrimate's Muncher";
    return options;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("#munch-monsters-start").click(async () => {
      $('button[id^="munch-"]').prop('disabled', true);
      this.parseCritters();
    });
    html.find("#munch-spells-start").click(async () => {
      $('button[id^="munch-"]').prop('disabled', true);
      this.parseSpells();
    });
    html.find("#munch-items-start").click(async () => {
      $('button[id^="munch-"]').prop('disabled', true);
      this.parseItems();
    });

    // watch the change of the import-policy-selector checkboxes
    html.find('.munching-import-config input[type="checkbox"]').on("change", (event) => {
      game.settings.set(
        "ddb-importer",
        "munching-policy-" + event.currentTarget.dataset.section,
        event.currentTarget.checked
      );
    });
    this.close();
  }


  async parseCritters() {
    logger.info("Munching monsters!"); // eslint-disable-line no-console
    await parseCritters();
    this.close();
  }

  async parseSpells() {
    logger.info("Munching spells!"); // eslint-disable-line no-console
    await parseSpells();
    this.close();
  }

  async parseItems() {
    logger.info("Munching items!"); // eslint-disable-line no-console
    await parseItems();
    this.close();
  }

  getData() { // eslint-disable-line class-methods-use-this
    const cobalt = game.settings.get("ddb-importer", "cobalt-cookie") != "";
    const importConfig = [
      {
        name: "update-existing",
        isChecked: game.settings.get("ddb-importer", "munching-policy-update-existing"),
        description: "Update existing items.",
      },
      {
        name: "use-srd",
        isChecked: game.settings.get("ddb-importer", "munching-policy-use-srd"),
        description: "Copy matching SRD compendium items instead of importing.",
      },
      {
        name: "use-srd-icons",
        isChecked: game.settings.get("ddb-importer", "munching-policy-use-srd-icons"),
        description: "Use icons from the SRD compendiums.",
      },
    ];
    return {
      cobalt: cobalt,
      importConfig: importConfig,
    };
  }
}