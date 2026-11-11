import { test } from "node:test";
import { deepStrictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { InvoicePool } from "../src/engine/invoices.ts";
import type { Decision, Snapshot } from "../src/engine/types.ts";

interface CaseStep {
  i: number;
  t: number;
  op: string;
  args: Record<string, unknown>;
  label: string;
  expect: { decision: "ok" } | { decision: "refuse"; family: string; mood_decisive?: boolean };
  after: Snapshot;
}

interface Scenario {
  id: string;
  pool_policy: Record<string, unknown>;
  mood_policy: Record<string, unknown>;
  steps: CaseStep[];
}

interface CaseFile {
  format: string;
  seed: number;
  families: string[];
  scenarios: Scenario[];
  summary: Record<string, unknown>;
}

test("differential replay of reference/cases.json", () => {
  const casePath = resolve(import.meta.dirname, "..", "reference", "cases.json");
  const caseFile: CaseFile = JSON.parse(readFileSync(casePath, "utf8"));

  let totalSteps = 0;

  for (const scenario of caseFile.scenarios) {
    const pool = new InvoicePool(
      scenario.pool_policy as any,
      scenario.mood_policy as any
    );

    for (const step of scenario.steps) {
      totalSteps++;

      const result = pool.apply(step.op, step.t, step.args);

      // Compare decision and family (if refused), ignoring mood_decisive.
      const resultForComparison: Decision =
        result.decision === "ok"
          ? { decision: "ok" }
          : {
              decision: "refuse",
              family: result.family,
            };

      const expectedForComparison: Decision =
        step.expect.decision === "ok"
          ? { decision: "ok" }
          : {
              decision: "refuse",
              family: step.expect.family,
            };

      const msg = `scenario=${scenario.id} step=${step.i} label="${step.label}" op=${step.op}`;

      deepStrictEqual(resultForComparison, expectedForComparison, msg);

      // Compare snapshot.
      const snapshot = pool.snapshot();
      deepStrictEqual(snapshot, step.after, msg);
    }
  }

  console.log(`Replayed ${totalSteps} steps across ${caseFile.scenarios.length} scenarios.`);
});
