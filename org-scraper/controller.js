// Controller launches the next 3 scrapers every 2 minutes.

import * as scrape from './scrape.js';

const dateStart = new Date();
console.log(`Organization scraping starting. It is ${dateStart.toLocaleString()}.`);

const locked = await locks.get('scrape');
if (locked) {
    console.log('Another instance is already scraping. Exiting.');
    process.exit(1);
};

console.log('Setting lock for scraping...');
await locks.set('scrape');

console.log('Removing lock for scraping...');
await locks.remove('scrape');

const dateEnd = new Date();
console.log(`Organization scraping ending. It is ${dateEnd.toLocaleString()} (${dateEnd - dateStart} ms elapsed).`);