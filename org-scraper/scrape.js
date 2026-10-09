import * as locks from './locks.js';
import * as gemini from './gemini.js';
// import CDN from '@dangoweb/cdn';

const dateStart = new Date();
console.log(`Organization scraping starting. It is ${dateStart.toLocaleString()}.`);

const locked = await locks.get('scrape');
if (locked) {
  console.log('Another instance is already scraping. Exiting.');
  process.exit(1);
};

console.log('Setting lock for scraping...');
await locks.set('scrape');

// const cdn = new CDN({
//   dir: './cache/',
//   extension: '.json',
//   ttl: 86400,
// });

// let tableSchema = null;
// if (cdn.valid('tableSchema')) {
//   tableSchema = cdn.get('tableSchema');
// } else {
//   tableSchema = { 'hello': 'world' };
//   cdn.cache('tableSchema', tableSchema);
// };

// console.log(tableSchema);

console.log('Removing lock for scraping...');
await locks.remove('scrape');

const dateEnd = new Date();
console.log(`Organization scraping ending. It is ${dateEnd.toLocaleString()} (${dateEnd - dateStart} ms elapsed).`);
process.exit(0);