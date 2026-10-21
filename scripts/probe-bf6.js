// `I` is likely defined in the Footer chunk. Fetch it and search there too.
const fs = require('fs');
const { execSync } = require('child_process');

// grep in main bundle for I= assignments with axios-ish content
const js = fs.readFileSync('/home/z/my-project/scripts/bf-main.js', 'utf8');
const candidates = js.match(/[,{;]I=[^;]{0,160}/g) || [];
console.log('--- I= assignments (first 10) ---');
candidates.slice(0, 10).forEach(m => console.log(JSON.stringify(m.slice(0, 160)), '\n'));
