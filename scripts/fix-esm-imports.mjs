import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

function walkDir(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkDir(full));
    } else if (extname(full) === '.js') {
      files.push(full);
    }
  }
  return files;
}

const IMPORT_RE = /(?<=^(?:export |export type )?(?:import|export)\s+(?:\{[^}]*\}\s+from\s+|[^*]+\s+from\s+))(["'])(\.[^"']+)\1/gm;
const EXPORT_ALL_RE = /(?<=^(?:export \* from\s+))(["'])(\.[^"']+)\1/gm;

function resolveSpec(dir, spec) {
  if (extname(spec)) return spec;
  const base = spec.endsWith('/') ? `${spec}index` : spec;
  const asFile = join(dir, `${base}.js`);
  const asDir = join(dir, base, 'index.js');
  if (existsSync(asFile)) return `${base}.js`;
  if (existsSync(asDir)) return `${base}/index.js`;
  return `${base}.js`; // fallback, will error but matches bundler behavior
}

function fixFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  let modified = false;
  const dir = dirname(filePath);

  const replaceSpecifier = (match, quote, spec) => {
    const resolved = resolveSpec(dir, spec);
    return `${quote}${resolved}${quote}`;
  };

  const newContent = content
    .replace(IMPORT_RE, replaceSpecifier)
    .replace(EXPORT_ALL_RE, replaceSpecifier);

  if (newContent !== content) {
    writeFileSync(filePath, newContent, 'utf-8');
    modified = true;
  }
  return modified;
}

const files = walkDir(distDir);
let fixedCount = 0;
for (const file of files) {
  if (fixFile(file)) {
    const rel = relative(distDir, file);
    console.log(`  fixed: ${rel}`);
    fixedCount++;
  }
}

console.log(`Fixed ${fixedCount}/${files.length} files`);
