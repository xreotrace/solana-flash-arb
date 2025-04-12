// Add this at the VERY TOP to ensure local module resolution
require("module-alias/register");

const path = require("path");
const { green, red } = require("colorette");

console.log("Running checks from:", __dirname);

try {
  // Explicit paths
  require(path.join(__dirname, "validateConfigs.js"))(
    path.join(__dirname, "../configs")
  );
  require(path.join(__dirname, "idlSanitizer.js"))(
    path.join(__dirname, "../target/idl/flash_arbitrage.json")
  );
  console.log(green("✓ All systems go"));
} catch (error) {
  console.error(red("✖ Startup failed:"), error.message);
  process.exit(1);
}
