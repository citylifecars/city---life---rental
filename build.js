
const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of ["index.html", "app.js", "styles.css"]) {
  fs.copyFileSync(
    path.join(root, file),
    path.join(dist, file)
  );
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "";

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

fs.writeFileSync(
  path.join(dist, "config.js"),
  `window.CLC_CONFIG=${JSON.stringify({
    supabaseUrl: supabaseUrl,
    supabasePublishableKey: supabaseKey
  })};\n`
);

console.log(
  "City Life Rental build complete.",
  "Supabase URL configured:",
  Boolean(supabaseUrl),
  "Publishable key configured:",
  Boolean(supabaseKey)
);
