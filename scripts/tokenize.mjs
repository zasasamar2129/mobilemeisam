// One-shot design-token migration for core-scope files (ui/, layout/, sims/).
// Run: node scripts/tokenize.mjs   (idempotent-ish; safe to re-run)
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/Mobilemeisam/Downloads/mmba/src/components';
const dirs = ['ui', 'layout', 'sims'];
const files = [];
for (const d of dirs) {
  const p = path.join(ROOT, d);
  if (!fs.existsSync(p)) continue;
  for (const f of fs.readdirSync(p)) if (f.endsWith('.tsx')) files.push(path.join(p, f));
  for (const f of fs.readdirSync(p)) if (f.endsWith('.ts')) files.push(path.join(p, f));
}

// Ordered replacements: longer/more-specific first, so dark variants collapse before the bare form is touched.
const rules = [
  // Surface
  [/\bbg-white[ /](dark\:)?bg-slate-950/g, 'bg-surface'],
  [/\bbg-white[ /](dark\:)?bg-slate-900/g, 'bg-surface'],
  [/\bbg-white\/95 dark:bg-slate-950\/95/g, 'bg-surface/95'],
  [/\bbg-slate-100 dark:bg-slate-800/g, 'bg-surface-subtle'],
  [/\bbg-slate-100/g, 'bg-surface-subtle'],
  [/\bdark:bg-slate-900/g, 'dark:bg-surface-subtle'],
  // Text tiers
  [/\btext-slate-900 dark:text-slate-100/g, 'text-primary'],
  [/\btext-slate-900 dark:text-slate-50/g, 'text-primary'],
  [/\btext-slate-800 dark:text-slate-100/g, 'text-primary'],
  [/\btext-slate-800/g, 'text-secondary'],
  [/\btext-slate-700 dark:text-slate-300/g, 'text-secondary'],
  [/\btext-slate-700/g, 'text-secondary'],
  [/\btext-slate-600 dark:text-slate-400/g, 'text-secondary'],
  [/\btext-slate-600/g, 'text-secondary'],
  [/\btext-slate-500 dark:text-slate-400/g, 'text-muted'],
  [/\btext-slate-500/g, 'text-muted'],
  [/\btext-slate-400/g, 'text-muted'],
  // Border
  [/\bborder-slate-200 dark:border-slate-700\/60/g, 'border-primary'],
  [/\bborder-slate-200 dark:border-slate-700/g, 'border-primary'],
  [/\bborder-slate-200 dark:border-slate-800/g, 'border-primary'],
  [/\bborder-slate-200/g, 'border-primary'],
  [/\bdark:border-slate-800/g, 'dark:border-border-subtle'],
  [/\bdark:border-slate-700/g, 'dark:border-border-subtle'],
  // Primary (indigo → primary)
  [/\bfrom-indigo-500 to-indigo-600/g, 'bg-primary'],
  [/\bbg-indigo-600 hover:bg-indigo-700/g, 'bg-primary hover:bg-primary-hover'],
  [/\bbg-indigo-600/g, 'bg-primary'],
  [/\bhover:bg-indigo-700/g, 'hover:bg-primary-hover'],
  [/\bbg-indigo-500 hover:bg-indigo-600/g, 'bg-primary hover:bg-primary-hover'],
  [/\bbg-indigo-500/g, 'bg-primary'],
  [/\bhover:bg-indigo-500/g, 'hover:bg-primary-hover'],
  [/\btext-indigo-700 dark:text-indigo-300/g, 'text-primary'],
  [/\btext-indigo-600 dark:text-indigo-400/g, 'text-primary'],
  [/\btext-indigo-600/g, 'text-primary'],
  [/\btext-indigo-700/g, 'text-primary'],
  [/\bborder-indigo-200 dark:border-indigo-500\/30/g, 'border-primary'],
  [/\bborder-indigo-500\/30/g, 'border-primary'],
  [/\bfrom-indigo-500/g, 'from-primary'],
  // status tints → semantic tokens (only the /10 + text combos used for badges/chips)
  [/\bbg-emerald-50 dark:bg-emerald-500\/10 text-emerald-700 dark:text-emerald-300/g, 'bg-success/10 text-success'],
  [/\bbg-emerald-50 dark:bg-emerald-500\/10 text-emerald-600 dark:text-emerald-400/g, 'bg-success/10 text-success'],
  [/\bbg-emerald-100 dark:bg-emerald-500\/10 text-emerald-700/g, 'bg-success/10 text-success'],
  [/\bbg-emerald-50 text-emerald-700 dark:text-emerald-300/g, 'bg-success/10 text-success'],
  [/\bbg-emerald-500\/10 text-emerald-700/g, 'bg-success/10 text-success'],
  [/\bbg-emerald-500\/10 text-emerald-600/g, 'bg-success/10 text-success'],
  [/\btext-emerald-700 dark:text-emerald-300/g, 'text-success'],
  [/\btext-emerald-600 dark:text-emerald-400/g, 'text-success'],
  [/\bbg-rose-50 dark:bg-rose-500\/10 text-rose-700 dark:text-rose-300/g, 'bg-danger/10 text-danger'],
  [/\bbg-rose-50 dark:bg-rose-500\/10 text-rose-600 dark:text-rose-400/g, 'bg-danger/10 text-danger'],
  [/\bbg-rose-100 dark:bg-rose-500\/10 text-rose-700/g, 'bg-danger/10 text-danger'],
  [/\bbg-rose-500\/10 text-rose-700/g, 'bg-danger/10 text-danger'],
  [/\bbg-rose-100 text-rose-700/g, 'bg-danger/10 text-danger'],
  [/\btext-rose-700 dark:text-rose-300/g, 'text-danger'],
  [/\btext-rose-600 dark:text-rose-400/g, 'text-danger'],
  [/\bbg-amber-50 dark:bg-amber-500\/10 text-amber-700 dark:text-amber-300/g, 'bg-warning/10 text-warning'],
  [/\bbg-amber-100 dark:bg-amber-500\/10 text-amber-800/g, 'bg-warning/10 text-warning'],
  [/\bbg-amber-500\/10 text-amber-700/g, 'bg-warning/10 text-warning'],
  [/\bbg-amber-100 text-amber-800/g, 'bg-warning/10 text-warning'],
  [/\btext-amber-700 dark:text-amber-300/g, 'text-warning'],
  [/\btext-amber-800/g, 'text-warning'],
  [/\bbg-sky-50 dark:bg-sky-500\/10 text-sky-700 dark:text-sky-300/g, 'bg-info/10 text-info'],
  [/\bbg-sky-500\/10 text-sky-700/g, 'bg-info/10 text-info'],
  [/\btext-sky-700 dark:text-sky-300/g, 'text-info'],
  [/\bbg-teal-50 dark:bg-teal-500\/10 text-teal-700 dark:text-teal-300/g, 'bg-success/10 text-success'],
  [/\btext-teal-700 dark:text-teal-300/g, 'text-success'],
  [/\bbg-purple-50 dark:bg-purple-500\/10 text-purple-700 dark:text-purple-300/g, 'bg-primary-light text-primary'],
  [/\btext-purple-700 dark:text-purple-300/g, 'text-primary'],
  // Indigo focus ring
  [/\bfocus:ring-indigo-500/g, 'focus:ring-primary'],
  [/\bfocus:border-indigo-500/g, 'focus:border-primary'],
  // Primary border/bg-light
  [/\bbg-indigo-50 dark:bg-indigo-500\/10/g, 'bg-primary-light'],
  [/\bbg-indigo-50/g, 'bg-primary-light'],
  [/\bhover:bg-indigo-50/g, 'hover:bg-primary-light'],
];

let total = 0;
for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;
  for (const [re, rep] of rules) {
    src = src.replace(re, rep);
  }
  if (src !== orig) {
    fs.writeFileSync(file, src);
    total++;
    console.log('migrated:', file);
  }
}
console.log(`\nDone. ${total} file(s) touched.`);