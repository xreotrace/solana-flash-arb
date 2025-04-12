const path = require("path");
const root = __dirname;

module.exports = {
  ROOT: root,
  CONFIGS: path.join(root, "configs"),
  IDL: path.join(root, "target", "idl", "flash_arbitrage.json"),
  BOT: path.join(root, "bot"),
};
