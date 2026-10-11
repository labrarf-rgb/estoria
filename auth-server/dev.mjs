// Local broker at http://localhost:3000, for the app on http://localhost:5173.
// Settings come from auth-server/.env.local (gitignored), falling back to the
// local defaults below. The handler is the same one Vercel runs.
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createBroker } from "./src/broker.mjs";

const envFile = fileURLToPath(new URL("./.env.local", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = Number(process.env.PORT) || 3000;
const handle = createBroker({
  BROKER_URL: `http://localhost:${port}`,
  ALLOWED_ORIGINS: "http://localhost:5173",
  ...process.env,
});

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const response = await handle(
    new Request(`http://localhost:${port}${req.url}`, {
      method: req.method,
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    })
  );
  const out = {};
  response.headers.forEach((v, k) => {
    if (k !== "set-cookie") out[k] = v;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) out["set-cookie"] = cookies;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`Estoria broker on http://localhost:${port}`));
