// Runs at build time (see netlify.toml). Scans content/speakers for every
// .md file Decap has created and writes a manifest listing them, so the
// front end never needs a hardcoded file list — add or delete a speaker
// in Decap and the next deploy just picks it up automatically.
const fs = require('fs');
const path = require('path');

const speakersDir = path.join(__dirname, '..', 'content', 'speakers');
const outFile = path.join(speakersDir, 'manifest.json');

const files = fs.readdirSync(speakersDir).filter(f => f.endsWith('.md'));

fs.writeFileSync(outFile, JSON.stringify(files, null, 2));
console.log(`Wrote ${files.length} speaker(s) to manifest.json:`, files);
