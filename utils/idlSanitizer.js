module.exports = (idlPath) => {
  const { green, red } = require("colorette");
  const fs = require("fs");

  try {
    let content = fs
      .readFileSync(idlPath, "utf8")
      .replace(/^\uFEFF/, "") // Remove BOM
      .replace(/,\s*([}\]])/g, "$1"); // Remove trailing commas

    fs.writeFileSync(idlPath, content, "utf8");
    console.log(green("✓ IDL sanitized"));
  } catch (error) {
    console.error(red(`IDL error: ${error.message}`));
    throw error;
  }
};
