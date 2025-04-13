const fs = require("fs");
const path = require("path");

// Get the bot root directory
const botRoot = path.join(__dirname, "..");

function validateConfigs() {
  try {
    const dexes = require(path.join(botRoot, "configs", "dexes.json"));
    const tokens = require(path.join(botRoot, "configs", "tokens.json"));

    if (!Array.isArray(dexes) || !dexes.every((d) => d.name && d.type)) {
      throw new Error("Invalid dexes.json structure");
    }

    if (!Array.isArray(tokens) || !tokens.every((t) => t.tokenA && t.tokenB)) {
      throw new Error("Invalid tokens.json structure");
    }

    console.log("✓ Config validation passed");
    return true;
  } catch (error) {
    console.error("Config validation failed:", error.message);
    process.exit(1);
  }
}

validateConfigs();
