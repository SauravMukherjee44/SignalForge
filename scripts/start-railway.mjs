import { openDatabase } from '../runtime/sqlite.mjs';
import { spawn } from 'node:child_process';

const filename = process.env.SIGNALFORGE_DATABASE_PATH;
if (!filename) throw new Error('Persistent database path is required.');
const database = openDatabase(filename);
database.migrate(new URL('../drizzle/', import.meta.url).pathname);
database.close();
const child = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'start', '--hostname', '0.0.0.0'], { stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
