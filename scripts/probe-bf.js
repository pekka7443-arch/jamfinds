// Probe the BeamFinds JS bundle for API endpoint + category param usage.
const fs = require('fs');
const js = fs.readFileSync('/home/z/my-project/scripts/bf-main.js', 'utf8');

const paths = [...new Set(js.match(/\/api\/[a-zA-Z0-9/_\-?]*/g) || [])];
console.log('API paths:', paths);

const catMatches = js.match(/.{100}category.{140}/g) || [];
console.log('\n--- category usages (first 14) ---');
catMatches.slice(0, 14).forEach((m, i) => console.log(i, JSON.stringify(m.replace(/\n/g, ' ')), '\n'));
