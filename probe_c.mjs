import { validateDeedTransferCompletion } from './src/lib/deedTransfer.js';
const DAY = 24*60*60*1000;
const at = (d) => new Date(Date.UTC(2026,0,1)+d*DAY).toISOString();
const r = validateDeedTransferCompletion({ previousTransferDate: at(0), deedTransferCompletedAt: at(5) }, Date.UTC(2026,0,1)+30*DAY);
console.log(JSON.stringify(r));
