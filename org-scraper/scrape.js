import * as locks from './locks.js';
import * as gemini from './gemini.js';

export default async function scrape(sport, state, schema) {
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
};
