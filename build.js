const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");

if (!fs.existsSync(dist)) {
  fs.mkdirSync(dist, { recursive: true });
}

const files = [
  "index.html",
  "app.js",
  "styles.css"
];

for (const file of files) {
  fs.copyFileSync(
    path.join(root, file),
    path.join(dist, file)
  );
}

console.log("City Life Rental build complete.");
