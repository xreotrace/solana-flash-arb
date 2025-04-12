const fs = require("fs");
const path = require("path");

function validateConfigs() {
  try {
    const dexes = require("../configs/dexes.json");
    const tokens = require("../configs/tokens.json");

    if (!Array.isArray(dexes) || !Array.isArray(tokens)) {
      throw new Error("Invalid config structure");
    }

    return true;
  } catch (error) {
    console.error("Config validation failed:", error);
    process.exit(1);
  }
}

module.exports = validateConfigs;
