const path = require("path");
const { green, red } = require("colorette");

console.log("Running pre-flight checks from:", __dirname);

try {
  // Configs are in root/configs/
  require("./validateConfigs.js");

  // IDL is in root/target/
  require("./idlSanitizer.js");

  console.log(green("✓ All checks passed"));
} catch (error) {
  console.error(red(`✖ Failed: ${error.message}`));
  process.exit(1);
}
