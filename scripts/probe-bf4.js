// Find the axios instance `I` definition (base URL).
const fs = require('fs');
const js = fs.readFileSync('/home/z/my-project/scripts/bf-main.js', 'utf8');

// Search for common base URL strings
const urls = [...new Set(js.match(/https?:\/\/[a-zA-Z0-9.\-_]+\/?[a-zA-Z0-9\-_]*\/?api[a-zA-Z0-9\-_/]*/g) || [])];
console.log('https URLs containing api:', urls.slice(0, 30));

// Find axios import/creation patterns
const ax = js.match(/axios[.\w]*\.create|\.create\(\)/g) || [];
console.log('\naxios create patterns:', ax.slice(0, 10));

// Look for I=X= pattern near axios import
const idx = js.indexOf('mods/list');
// find occurrences of "I." definition: search backwards from qy for `I=`
const qyidx = js.indexOf('qy=e=>I.post');
console.log('\ncontext before qy:', JSON.stringify(js.slice(Math.max(0, qyidx - 1500), qyidx).slice(-800)));
