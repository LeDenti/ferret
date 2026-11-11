import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IncomingMessage, ServerResponse } from "node:http";
import { Registry } from "./pools.ts";
import type { Decision } from "../engine/types.ts";

const WEB_DIR = join(import.meta.dirname, "../web");

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  registry: Registry
): Promise<void> {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;

  setCorsHeaders(res);

  if (method === "GET" && path === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (method === "GET" && (path === "/" || path === "/app.js" || path === "/app.css")) {
    return serveStatic(res, path);
  }

  if (method === "GET" && path === "/api/state") {
    return handleGetState(req, res, registry);
  }

  if (method === "POST" && path === "/api/event") {
    return handlePostEvent(req, res, registry);
  }

  if (method === "POST" && path === "/api/tick") {
    return handlePostTick(req, res, registry);
  }

  if (method === "POST" && path === "/api/reset") {
    return handlePostReset(req, res, registry);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function serveStatic(res: ServerResponse, path: string): void {
  const fileMap: Record<string, string> = {
    "/": "index.html",
    "/app.js": "app.js",
    "/app.css": "app.css",
  };

  const filename = fileMap[path];
  if (!filename) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  try {
    const filePath = join(WEB_DIR, filename);
    if (!filePath.startsWith(WEB_DIR)) {
      throw new Error("Path traversal detected");
    }

    const content = readFileSync(filePath, "utf-8");
    const contentType =
      filename === "index.html"
        ? "text/html"
        : filename === "app.js"
          ? "text/javascript"
          : "text/css";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }
}

async function handleGetState(
  req: IncomingMessage,
  res: ServerResponse,
  registry: Registry
): Promise<void> {
  const cookieId = getCookie(req, "poolId");
  const { id, session } = registry.get(cookieId);

  const snapshot = session.pool.snapshot();
  const journal = session.pool.journal.slice(-50);

  setCookie(res, "poolId", id);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      tick: session.tick,
      snapshot,
      journal,
      policy: session.pool.policy,
      mood_policy: session.pool.mood.p,
    })
  );
}

async function handlePostEvent(
  req: IncomingMessage,
  res: ServerResponse,
  registry: Registry
): Promise<void> {
  const body = await readBody(req);
  let parsed: { op?: string; args?: unknown };

  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }

  const { op, args } = parsed;

  if (!isValidOp(op)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid op" }));
    return;
  }

  const validation = validateArgs(op, args);
  if (validation) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: validation }));
    return;
  }

  const cookieId = getCookie(req, "poolId");
  const { id, session } = registry.get(cookieId);

  if (!registry.checkRateLimit(id)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "rate limit" }));
    return;
  }

  setCookie(res, "poolId", id);

  try {
    const decision = session.pool.apply(op, session.tick, args as Record<string, unknown>);
    const snapshot = session.pool.snapshot();
    const entry = session.pool.journal[session.pool.journal.length - 1];

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ decision, snapshot, entry }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "internal error" }));
  }
}

async function handlePostTick(
  req: IncomingMessage,
  res: ServerResponse,
  registry: Registry
): Promise<void> {
  const body = await readBody(req);
  let parsed: { days?: unknown };

  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }

  const { days } = parsed;

  if (typeof days !== "number" || days < 1 || days > 365 || !Number.isInteger(days)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "days must be 1..365" }));
    return;
  }

  const cookieId = getCookie(req, "poolId");
  const { id, session } = registry.get(cookieId);

  setCookie(res, "poolId", id);
  session.tick += days;

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ tick: session.tick }));
}

async function handlePostReset(
  req: IncomingMessage,
  res: ServerResponse,
  registry: Registry
): Promise<void> {
  const cookieId = getCookie(req, "poolId");
  const { id, session } = registry.get(cookieId);

  registry.reset(id);
  const resetSession = registry.get(id);

  setCookie(res, "poolId", id);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      tick: resetSession.session.tick,
      snapshot: resetSession.session.pool.snapshot(),
    })
  );
}

function isValidOp(op: unknown): op is string {
  if (typeof op !== "string") return false;
  return ["deposit", "withdraw", "advance", "repay", "default", "buyback"].includes(op);
}

function validateArgs(op: string, args: unknown): string | null {
  if (typeof args !== "object" || args === null) {
    return "args must be an object";
  }

  const a = args as Record<string, unknown>;

  const isValidInt = (v: unknown, min = 0, max = 1e9): boolean =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

  const isValidString = (v: unknown): boolean =>
    typeof v === "string" && v.length <= 32 && /^[A-Za-z0-9 _-]*$/.test(v);

  const isValidAnalysis = (v: unknown): boolean =>
    typeof v === "string" || typeof v === "boolean";

  switch (op) {
    case "deposit":
      if (!isValidString(a.lender)) return "lender must be a string ≤32 chars, alphanumeric+space/_-";
      if (!isValidInt(a.amount, 0)) return "amount must be an integer 0..10^9";
      return null;

    case "withdraw":
      if (!isValidString(a.lender)) return "lender must be a string ≤32 chars, alphanumeric+space/_-";
      return null;

    case "advance":
      if (!isValidString(a.invoice)) return "invoice must be a string ≤32 chars";
      if (!isValidString(a.supplier)) return "supplier must be a string ≤32 chars";
      if (!isValidString(a.debtor)) return "debtor must be a string ≤32 chars";
      if (!isValidInt(a.face, 0)) return "face must be an integer 0..10^9";
      if (!isValidInt(a.advance, 0)) return "advance must be an integer 0..10^9";
      if (!isValidInt(a.fee, 0)) return "fee must be an integer 0..10^9";
      if (!isValidInt(a.due, 0)) return "due must be an integer 0..10^9";
      if (!isValidAnalysis(a.analysis)) return "analysis must be a string or boolean";
      return null;

    case "repay":
      if (!isValidString(a.invoice)) return "invoice must be a string ≤32 chars";
      if (!isValidInt(a.amount, 0)) return "amount must be an integer 0..10^9";
      return null;

    case "default":
      if (!isValidString(a.invoice)) return "invoice must be a string ≤32 chars";
      return null;

    case "buyback":
      if (!isValidString(a.invoice)) return "invoice must be a string ≤32 chars";
      if (a.payer !== undefined && !isValidString(a.payer)) return "payer must be a string ≤32 chars, alphanumeric+space/_-";
      return null;

    default:
      return "unknown op";
  }
}

function getCookie(req: IncomingMessage, name: string): string | undefined {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(res: ServerResponse, name: string, value: string): void {
  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${2 * 60 * 60}`
  );
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
