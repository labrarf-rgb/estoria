// Vercel entry point. vercel.json rewrites every path here, passing the
// original one as ?__path. The handler is the same one dev.mjs runs locally.
import { createBroker } from "../src/broker.mjs";

export default { fetch: createBroker(process.env) };
