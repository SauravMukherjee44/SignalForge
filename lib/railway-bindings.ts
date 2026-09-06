import { getDb } from './db.railway';
export const env = { get DB() { return getDb(); } };
