import { createServer } from "node:http";
import { Registry } from "./pools.ts";
import { handleRequest } from "./http.ts";

const PORT = parseInt(process.env.PORT || "8787", 10);
const registry = new Registry();

const server = createServer(async (req, res) => {
  try {
    await handleRequest(req, res, registry);
  } catch (err) {
    console.error("Unhandled error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "internal error" }));
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
