const fs = require("fs");
const path = require("path");

function sanitizeIdlFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, "utf8");

    // Remove BOM and fix common JSON issues
    content = content
      .replace(/^\uFEFF/, "")
      .replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2":')
      .replace(/,\s*([}\]])/g, "$1");

    // Write back the sanitized file
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  } catch (error) {
    console.error("IDL sanitization failed:", error);
    return false;
  }
}

module.exports = { sanitizeIdlFile };
