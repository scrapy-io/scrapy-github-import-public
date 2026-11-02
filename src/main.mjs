/**
 * Stage 5 Phase B acceptance fixture (publisher-hello). Plain fetch against /runtime/v1 with the run
 * token — the same wire contract as @scrapyio/sdk, without needing the SDK inside the image.
 *
 * Input (GET /runtime/v1/input):
 *   {}                         push 5 items, exit 0                       (R1)
 *   { fail: true }             log an error, exit 1                       (R2)
 *   { sleep: secs, n?: }       sleep (cancel / timeout target), then push (R3, R4)
 *   { n: 3, each: true }       push items ONE AT A TIME; a 402 (result cap / credits) is logged
 *                              and handled, exit 0                        (R6)
 *   { printEnv: true }         print env var NAMES only (never values)    (R7)
 */
const BASE = (process.env.SCRAPYIO_API_BASE_URL ?? '').replace(/\/+$/, '');
const TOKEN = process.env.SCRAPYIO_RUN_TOKEN ?? '';

function log(msg) {
  console.log(msg);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function batchKey() {
  return `hello-${Date.now()}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function push(items) {
  return api('POST', '/runtime/v1/datasets/default/items', { batchKey: batchKey(), items });
}

log('publisher-hello: start');
const inputRes = await api('GET', '/runtime/v1/input');
if (inputRes.status !== 200) {
  console.error(`publisher-hello: input fetch failed status=${inputRes.status}`);
  process.exit(2);
}
const input = inputRes.json && typeof inputRes.json === 'object' ? inputRes.json : {};

if (input.printEnv === true) {
  const names = Object.keys(process.env).sort();
  log(`ENV_NAMES ${JSON.stringify(names)}`);
  process.exit(0);
}

if (input.fail === true) {
  console.error('publisher-hello: fail requested -> exit 1');
  process.exit(1);
}

const sleepSecs = Number(input.sleep ?? 0);
if (Number.isFinite(sleepSecs) && sleepSecs > 0) {
  log(`publisher-hello: sleeping ${sleepSecs}s`);
  await new Promise((r) => setTimeout(r, sleepSecs * 1000));
}

const nRaw = Number(input.n ?? 5);
const n = Number.isFinite(nRaw) && nRaw > 0 ? Math.min(Math.floor(nRaw), 1000) : 5;

if (input.each === true) {
  let accepted = 0;
  for (let i = 0; i < n; i += 1) {
    const r = await push([{ i, hello: true, source: 'publisher-hello' }]);
    if (r.status === 200) {
      accepted += 1;
      log(`publisher-hello: item ${i} accepted`);
      continue;
    }
    const type = r.json && typeof r.json === 'object' ? (r.json.type ?? r.json.code ?? 'unknown') : 'unknown';
    log(`publisher-hello: item ${i} rejected status=${r.status} type=${type} (handled)`);
    break;
  }
  log(`publisher-hello: done accepted=${accepted}`);
  process.exit(0);
}

log(`publisher-hello: pushing ${n} items`);
const items = Array.from({ length: n }, (_, i) => ({ i, hello: true, source: 'publisher-hello' }));
const r = await push(items);
if (r.status !== 200) {
  console.error(`publisher-hello: push failed status=${r.status}`);
  process.exit(3);
}
log('publisher-hello: done');
process.exit(0);
