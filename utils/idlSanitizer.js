const fs = require("fs");
const path = require("path");

try {
  // Path to root/target/
  const idlPath = path.join(__dirname, "../target/idl/flash_arbitrage.json");
  console.log("Sanitizing IDL at:", idlPath);

  // ...rest of sanitization code...
} catch (error) {
  console.error("IDL error:", error.message);
  process.exit(1);
}
