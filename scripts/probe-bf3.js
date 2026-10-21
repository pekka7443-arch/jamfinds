// Find the axios instance base URL and category enum used by /mods/list.
const fs = require('fs');
const js = fs.readFileSync('/home/z/my-project/scripts/bf-main.js', 'utf8');

// axios.create({ baseURL: ... })
const baseMatches = js.match(/create\(\{[^}]{0,200}/g) || [];
console.log('--- axios.create configs ---');
baseMatches.forEach(m => console.log(JSON.stringify(m), '\n'));

// baseURL references
const bm = js.match(/baseURL.{0,120}/g) || [];
console.log('--- baseURL refs ---');
bm.forEach(m => console.log(JSON.stringify(m), '\n'));

// category enum in body — search for category near filter values like "IRL Vehicle"
const catEnum = js.match(/.{60}"IRL Vehicle".{200}/g) || js.match(/.{60}IRL Vehicle.{200}/g) || [];
console.log('--- IRL Vehicle literals ---');
catEnum.slice(0, 8).forEach((m, i) => console.log(i, JSON.stringify(m.replace(/\n/g, ' ')), '\n'));
