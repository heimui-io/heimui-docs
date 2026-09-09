/**
 * Runs the published hydration corpus against this implementation.
 *
 * Every case is a screen, a payload, the document a device should receive, and the expressions that
 * should have been reported as unresolved. If all of them pass, this implementation agrees with
 * every other one -- which is the only definition of correct that means anything here.
 *
 *     node run-corpus.mjs [path/to/corpus]
 */
import { deepStrictEqual } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { hydrateWithReport, UnresolvedPolicy } from './heimui-hydration.mjs';

const dir = process.argv[2] ?? '../../corpus';
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) throw new Error(`no cases found in ${dir}`);

const failures = [];
for (const file of files) {
  const testCase = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  const policy = testCase.options?.onUnresolved === 'blank' ? UnresolvedPolicy.BLANK : UnresolvedPolicy.KEEP;
  const { document, unresolved } = hydrateWithReport(testCase.screen, testCase.data, policy);

  let ok = true;
  try {
    deepStrictEqual(document, testCase.expected);
  } catch {
    ok = false;
    failures.push(`${file}: document\n  expected ${JSON.stringify(testCase.expected)}\n  but was  ${JSON.stringify(document)}`);
  }

  const wanted = (testCase.expectedUnresolved ?? []).map((u) => `${u.nodeId}|${u.property}|${u.expression}`);
  const got = unresolved.map((u) => `${u.nodeId}|${u.property}|${u.expression}`);
  if (JSON.stringify(wanted) !== JSON.stringify(got)) {
    ok = false;
    failures.push(`${file}: unresolved\n  expected ${JSON.stringify(wanted)}\n  but was  ${JSON.stringify(got)}`);
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${file}`);
}

console.log();
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`${files.length}/${files.length} cases pass.`);
