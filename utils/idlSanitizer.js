const fs = require("fs");
const path = require("path");

function sanitizeIdlFile(idlPath) {
  // <-- Accept path as parameter
  try {
    if (!fs.existsSync(idlPath)) {
      console.error("IDL file not found at:", idlPath);
      return false;
    }

    let content = fs.readFileSync(idlPath, "utf8");
    content = content
      .replace(/^\uFEFF/, "")
      .replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2":')
      .replace(/,\s*([}\]])/g, "$1");

    fs.writeFileSync(idlPath, content, "utf8");
    return true;
  } catch (error) {
    console.error("IDL sanitization failed:", error);
    return false;
  }
}

module.exports = sanitizeIdlFile; // <-- Export instead of executing
