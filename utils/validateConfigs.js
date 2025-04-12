const path = require("path");
const { green, red } = require("colorette");

try {
  // Path to root/configs/
  const dexes = require("../configs/dexes.json");
  const tokens = require("../configs/tokens.json");

  console.log(green("✓ Configs loaded from:", path.resolve("../configs")));
} catch (error) {
  console.error(red("Config error:"), error.message);
  process.exit(1);
}
