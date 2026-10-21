// Extract the mods-list fetch function (qy) and category list (rN) from the bundle.
const fs = require('fs');
const js = fs.readFileSync('/home/z/my-project/scripts/bf-main.js', 'utf8');

// Find where qy is defined: look for "async function qy" or "qy=" patterns
let idx = js.indexOf('function qy');
if (idx < 0) idx = js.indexOf('qy=');
if (idx < 0) idx = js.indexOf('const qy');
console.log('--- qy definition ---');
console.log(js.slice(idx, idx + 900));

// rN category list
const ridx = js.indexOf('rN=');
if (ridx >= 0) {
  console.log('\n--- rN definition ---');
  console.log(js.slice(ridx, ridx + 700));
}

// limit constant lm
const lmidx = js.indexOf('lm=');
if (lmidx >= 0) {
  console.log('\n--- lm (limit) ---');
  console.log(js.slice(lmidx, lmidx + 80));
}
