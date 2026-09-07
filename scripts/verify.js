#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
let failures = 0;
let checks = 0;

function ok(label) { checks += 1; console.log(`✓ ${label}`); }
function fail(label, detail='') { checks += 1; failures += 1; console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`); }
function walk(dir, predicate, out=[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

// 1) JavaScript syntax
const jsFiles = walk(root, f => f.endsWith('.js'));
let jsBad = [];
for (const file of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  if (r.status !== 0) jsBad.push(`${path.relative(root,file)}: ${String(r.stderr).trim().split('\n').slice(-1)[0]}`);
}
jsBad.length ? fail('JavaScript syntax', jsBad.join('; ')) : ok(`JavaScript syntax (${jsFiles.length} files)`);

// 2) EJS delimiter balance
const ejsFiles = walk(path.join(root,'views'), f => f.endsWith('.ejs'));
const ejsBad = [];
for (const file of ejsFiles) {
  const text = fs.readFileSync(file,'utf8');
  const opens = (text.match(/<%/g) || []).length;
  const closes = (text.match(/%>/g) || []).length;
  if (opens !== closes) ejsBad.push(`${path.relative(root,file)} (${opens}/${closes})`);
}
ejsBad.length ? fail('EJS delimiter balance', ejsBad.join(', ')) : ok(`EJS delimiter balance (${ejsFiles.length} files)`);

// 3) Route handler names exist on imported controllers (static check)
const routeFiles = walk(path.join(root,'routes'), f => f.endsWith('.js'));
const routeBad = [];
for (const routeFile of routeFiles) {
  const text = fs.readFileSync(routeFile,'utf8');
  const imports = {};
  for (const m of text.matchAll(/const\s+(\w+)\s*=\s*require\(['"]\.\.\/controllers\/([^'"]+)['"]\)/g)) {
    imports[m[1]] = path.join(root,'controllers',`${m[2]}.js`);
  }
  for (const [alias, controllerFile] of Object.entries(imports)) {
    if (!fs.existsSync(controllerFile)) { routeBad.push(`${path.relative(root,routeFile)} missing ${path.relative(root,controllerFile)}`); continue; }
    const controllerText = fs.readFileSync(controllerFile,'utf8');
    const methods = [...text.matchAll(new RegExp(`\\b${alias}\\.(\\w+)`, 'g'))].map(m=>m[1]);
    for (const method of new Set(methods)) {
      if (!new RegExp(`exports\\.${method}\\s*=`).test(controllerText)) routeBad.push(`${path.relative(root,routeFile)} -> ${alias}.${method}`);
    }
  }
}
routeBad.length ? fail('Route/controller wiring', routeBad.join(', ')) : ok(`Route/controller wiring (${routeFiles.length} route files)`);

// 4) Essential views referenced by res.render exist
const controllerFiles = walk(path.join(root,'controllers'), f => f.endsWith('.js'));
const missingViews = [];
for (const file of controllerFiles) {
  const text = fs.readFileSync(file,'utf8');
  for (const m of text.matchAll(/res\.render\(['"]([^'"]+)['"]/g)) {
    const view = path.join(root,'views',`${m[1]}.ejs`);
    if (!fs.existsSync(view)) missingViews.push(`${path.relative(root,file)} -> ${m[1]}`);
  }
}
missingViews.length ? fail('Rendered views exist', missingViews.join(', ')) : ok('Rendered views exist');

// 5) Required project files
for (const rel of ['app.js','package.json','config/database.js','models/Test.js','models/Result.js']) {
  fs.existsSync(path.join(root,rel)) ? ok(`Required file: ${rel}`) : fail(`Required file: ${rel}`);
}

console.log(`\nVerification: ${checks - failures}/${checks} checks passed.`);
if (failures) process.exit(1);
