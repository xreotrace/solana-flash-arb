module.exports = (configPath) => {
  const { green, red } = require("colorette");
  const fs = require("fs");
  const path = require("path");

  try {
    const dexes = JSON.parse(
      fs.readFileSync(path.join(configPath, "dexes.json"), "utf8")
    );
    const tokens = JSON.parse(
      fs.readFileSync(path.join(configPath, "tokens.json"), "utf8")
    );

    if (!Array.isArray(dexes)) throw new Error("dexes.json must be an array");
    if (!Array.isArray(tokens)) throw new Error("tokens.json must be an array");

    console.log(green("✓ Configs validated"));
  } catch (error) {
    console.error(red(`Config error: ${error.message}`));
    throw error; // Re-throw for run.js to handle
  }
};
