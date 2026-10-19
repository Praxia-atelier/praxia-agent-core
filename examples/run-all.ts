import { main as inbox } from './inbox-agent/run.js';
import { main as quote } from './quote-agent/run.js';
import { main as sales } from './sales-agent/run.js';

for (const demo of [inbox, sales, quote]) {
  await demo();
  console.log(`\n${'═'.repeat(80)}`);
}
