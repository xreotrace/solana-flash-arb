const fs = require("fs");
const path = require("path");

function sanitizeIdlFile() {
  try {
    const idlPath = path.join(__dirname, "../target/idl/flash_arbitrage.json");
    if (!fs.existsSync(idlPath)) {
      console.error("IDL file not found at:", idlPath);
      return false;
    }

    let content = fs.readFileSync(idlPath, "utf8");

    // Remove BOM and fix JSON
    content = content
      .replace(/^\uFEFF/, "") // Remove BOM
      .replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2":') // Fix keys
      .replace(/,\s*([}\]])/g, "$1"); // Remove trailing commas

    fs.writeFileSync(idlPath, content, "utf8");
    return true;
  } catch (error) {
    console.error("IDL sanitization failed:", error);
    return false;
  }
}

// Run immediately when called
if (!sanitizeIdlFile()) {
  process.exit(1);
}
