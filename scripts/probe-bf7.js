// Search Footer chunk for axios instance definition.
const fs = require('fs');
const js = fs.readFileSync('/home/z/my-project/scripts/bf-footer.js', 'utf8');

const candidates = js.match(/[,{;(]I=[^;]{0,200}/g) || [];
console.log('--- I= assignments ---');
candidates.slice(0, 10).forEach(m => console.log(JSON.stringify(m.slice(0, 200)), '\n'));

// baseURL anywhere
const bm = js.match(/baseURL[^,}]{0,120}/g) || [];
console.log('--- baseURL ---');
bm.slice(0, 10).forEach(m => console.log(JSON.stringify(m), '\n'));

// defaults with axios
const axm = js.match(/.{80}axios.{120}/g) || [];
console.log('--- axios refs ---');
axm.slice(0, 6).forEach((m, i) => console.log(i, JSON.stringify(m.replace(/\n/g, ' ')), '\n'));
