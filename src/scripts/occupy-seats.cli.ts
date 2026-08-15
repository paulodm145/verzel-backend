/**
 * Entrada executável de `npm run db:seats`. A lógica fica em
 * `occupy-seats.ts`, que o teste importa sem disparar nada.
 *
 * Uso: npm run db:seats -- --rate=0.6 --event=<uuid>
 */
import { runOccupySeats } from "./occupy-seats.js";

await runOccupySeats(process.argv.slice(2));
