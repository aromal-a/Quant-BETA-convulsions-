// Local test: sign up -> link paper broker -> place 2 trades -> check same session.
//   cd trade && npm install && node --env-file=../.env smoke-test.mjs
import { signUp, linkBroker, placeTrade, endSession, myFunnel } from './trade.js';

const email = `test+${Date.now()}@example.com`;
await signUp(email, crypto.randomUUID());
const link = await linkBroker('upstox', 'Upstox ••••00', 'paper');

const t1 = await placeTrade({ brokerLinkId: link.id, symbol: 'ONGC', side: 'buy', qty: 10, price: 268.4 });
const t2 = await placeTrade({ brokerLinkId: link.id, symbol: 'RELIANCE', side: 'buy', qty: 2, price: 2950 });
console.log('same session:', t1.session_id === t2.session_id);

await endSession();
const t3 = await placeTrade({ brokerLinkId: link.id, symbol: 'ONGC', side: 'sell', qty: 10, price: 271 });
console.log('new session after end:', t3.session_id !== t1.session_id);
console.log(await myFunnel());
