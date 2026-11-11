#!/usr/bin/env python3
"""A tiny MCP server (stdio, JSON-RPC 2.0) that exposes the Python oracle to Kiro.

Tool `replay_events`: give it a list of events ({op, t, args}) and optional policies; it returns, for each event,
the oracle's decision and refusal family, and the final snapshot. Kiro can thus ask the judge "what should happen
here?" while building, instead of guessing. Standard library only. Declared in .kiro/settings/mcp.json.

Protocol subset: initialize, notifications/initialized, tools/list, tools/call, ping. Content-free framing
(one JSON object per line), which is what Kiro's stdio transport speaks."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "python"))
from ferret.mood import MoodPolicy                    # noqa: E402
from ferret.invoices import InvoicePool, PoolPolicy, Refused  # noqa: E402

TOOL = {
    "name": "replay_events",
    "description": "Run a sequence of events through the Python reference oracle of Ferret (invoice pool + mood) and "
                   "return each decision (ok / refuse + family) and the final snapshot. Use it to check what the "
                   "TypeScript engine must do on a given input.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "events": {"type": "array", "items": {"type": "object", "properties": {
                "op": {"type": "string"}, "t": {"type": "integer"}, "args": {"type": "object"}},
                "required": ["op", "t", "args"]}},
            "pool_policy": {"type": "object"},
            "mood_policy": {"type": "object"},
        },
        "required": ["events"],
    },
}

def replay(events, pool_policy=None, mood_policy=None):
    pool = InvoicePool(PoolPolicy.from_json(pool_policy) if pool_policy else PoolPolicy(),
                       MoodPolicy.from_json(mood_policy) if mood_policy else MoodPolicy())
    out = []
    for ev in events:
        try:
            r = pool.apply(ev["op"], int(ev["t"]), **ev.get("args", {}))
            out.append({"op": ev["op"], "t": ev["t"], "decision": "ok", "result": r})
        except Refused as e:
            out.append({"op": ev["op"], "t": ev["t"], "decision": "refuse", "family": e.family, "text": e.text})
        except (TypeError, ValueError) as e:
            out.append({"op": ev["op"], "t": ev.get("t"), "decision": "error", "text": f"{type(e).__name__}: {e}"})
    return {"decisions": out, "snapshot": pool.snapshot()}

def reply(id_, result=None, error=None):
    msg = {"jsonrpc": "2.0", "id": id_}
    if error is not None: msg["error"] = error
    else: msg["result"] = result
    sys.stdout.write(json.dumps(msg) + "\n"); sys.stdout.flush()

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        try: req = json.loads(line)
        except json.JSONDecodeError: continue
        method, id_, params = req.get("method"), req.get("id"), req.get("params") or {}
        if method == "initialize":
            reply(id_, {"protocolVersion": params.get("protocolVersion", "2025-06-18"),
                        "capabilities": {"tools": {}}, "serverInfo": {"name": "ferret-oracle", "version": "1.0"}})
        elif method == "notifications/initialized": pass
        elif method == "ping": reply(id_, {})
        elif method == "tools/list": reply(id_, {"tools": [TOOL]})
        elif method == "tools/call":
            if params.get("name") != "replay_events":
                reply(id_, error={"code": -32602, "message": "unknown tool"}); continue
            a = params.get("arguments") or {}
            try:
                res = replay(a["events"], a.get("pool_policy"), a.get("mood_policy"))
                reply(id_, {"content": [{"type": "text", "text": json.dumps(res)}], "isError": False})
            except Exception as e:
                reply(id_, {"content": [{"type": "text", "text": f"{type(e).__name__}: {e}"}], "isError": True})
        elif id_ is not None:
            reply(id_, error={"code": -32601, "message": f"method not found: {method}"})

if __name__ == "__main__": main()
