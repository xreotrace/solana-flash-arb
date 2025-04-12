const { green, red } = require("colorette");
const path = require("path");

console.log("Running pre-flight checks from:", __dirname);

try {
  // Load configs from root/configs/
  const configPath = path.join(__dirname, "configs");
  require("./validateConfigs")(configPath);

  // Sanitize IDL from root/target/
  const idlPath = path.join(__dirname, "target", "idl", "flash_arbitrage.json");
  require("./idlSanitizer")(idlPath);

  console.log(green("✓ All systems ready"));
} catch (error) {
  console.error(red(`✖ Startup failed: ${error.message}`));
  process.exit(1);
}
