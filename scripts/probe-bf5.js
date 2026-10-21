// Find where `I` (axios instance) is imported/defined — check module imports from other chunks.
const fs = require('fs');
const js = fs.readFileSync('/home/z/my-project/scripts/bf-main.js', 'utf8');

// The bundle is ESM; `I` is likely imported from Footer chunk or another file. Search import statements mentioning api
const imports = js.match(/import\{[^}]{0,400}\}from"[^"]+"/g) || [];
console.log('--- imports containing short names ---');
imports.filter(i => /\bI\b/.test(i)).slice(0, 5).forEach(m => console.log(m, '\n'));

// Also check for fetch wrappers: /mods/list might be called via I where I has baseURL defined in Footer chunk
// Search for "new URL" or API_BASE constants
const consts = [...new Set(js.match(/[A-Z_]{4,}_[A-Z_]{2,}\s*=\s*"[^"]+"/g) || [])];
console.log('\nCONSTANTS:', consts.slice(0, 20));
