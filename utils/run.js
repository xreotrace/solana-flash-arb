// utils/run.js
const path = require("path");
const botRoot = path.join(__dirname, "..");

console.log("Running pre-start checks...");

// Run validation first
require("./validateConfigs.js");

// Then sanitize IDL
require("./idlSanitizer.js");

console.log("All pre-start checks completed successfully");
