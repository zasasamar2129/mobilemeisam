// Reliable missing-i18n-key scanner.
// Extracts keys used as t('...') in components, and keys defined in i18n.ts,
// then reports the difference. Filters t-import false positives.
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const srcDir = path.join(cwd, 'src');
const i18nFile = path.join(srcDir, 'lib', 'i18n.ts');

// 1. Defined keys from the faTranslations/enTranslations objects
const i18nSrc = fs.readFileSync(i18nFile, 'utf8');
const defined = new Set();
const keyRe = /^\s*"([a-z][a-zA-Z0-9.]*)":\s*"/gm;
let m;
while ((m = keyRe.exec(i18nSrc))) defined.add(m[1]);

// 2. Used keys: walk src, match t('...') / t("...") tokens.
const used = new Map(); // key -> sample file
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      const src = fs.readFileSync(p, 'utf8');
      const re = /\bt\(\s*['"]([a-z][a-zA-Z0-9.]*)['"]/g;
      let mm;
      while ((mm = re.exec(src))) {
        const k = mm[1];
        if (!used.has(k)) used.set(k, path.relative(cwd, p));
      }
    }
  }
}
walk(srcDir);

const missing = [...used.entries()].filter(([k]) => !defined.has(k)).sort((a, b) => a[0].localeCompare(b[0]));

console.log(`Defined: ${defined.size} | Used: ${used.size} | Missing: ${missing.length}\n`);
for (const [k, file] of missing) console.log(`${k}   ← ${file}`);