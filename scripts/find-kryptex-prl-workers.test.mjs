import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseWorker, findWorkers, parseArguments } from './find-kryptex-prl-workers.mjs';

const sample = (rates) => rates.map((hashrateTh, index) => ({ id: String(index), hashrateTh, status: 'online' }));
const chosen = (rates, target = 40, margin = 10) => chooseWorker(sample(rates), target, margin);

test('selecciona exclusivamente online y aplica fallback online', () => {
  const workers=[{id:'off',hashrateTh:40,status:'offline'},{id:'on',hashrateTh:42,status:'online'}];
  assert.equal(chooseWorker(workers,40,10).worker.id,'on');
  workers[1].hashrateTh=51;
  assert.equal(chooseWorker(workers,40,10).selection,'nearest_outside_range');
  workers[1].status='offline';
  assert.equal(chooseWorker(workers,40,10).worker,null);
});

test('valida objetivo y margen sin aceptar parámetros faltantes o no numéricos', () => {
  assert.deepEqual(parseArguments(['--target', '40', '--margin', '10']), { target: 40, margin: 10 });
  for (const args of [[], ['--target', '0', '--margin', '10'], ['--target', '40', '--margin', '-1'], ['--target', 'NaN', '--margin', '10'], ['--target', '40', '--margin', ''], ['--target', '40'], ['--target', '40', '--target', '41', '--margin', '10']]) {
    assert.throws(() => parseArguments(args));
  }
});

test('elige el más cercano dentro del rango inclusivo antes que un valor fuera', () => {
  assert.equal(chosen([39, 40, 45, 50]).worker.hashrateTh, 40);
  assert.equal(chosen([39, 42, 50]).worker.hashrateTh, 42);
  assert.equal(chosen([50]).selection, 'within_range');
  assert.equal(chosen([39, 41]).worker.hashrateTh, 41);
});

test('sin coincidencia selecciona el más cercano; empates y lista vacía son deterministas', () => {
  assert.equal(chosen([39, 51]).worker.hashrateTh, 39);
  assert.equal(chosen([39, 41], 40, 0).worker.id, '0');
  assert.deepEqual(chosen([]), { selection: 'no_valid_workers', worker: null });
});

test('procesa cuentas del ranking, convierte H/s, codifica la ruta y declara fallos parciales', async () => {
  const top = [
    { name: 'email@miner.com', is_kryptex: false },
    { name: 'kryptex-app', is_kryptex: true },
    { name: 'prl1abc', is_kryptex: false },
    { name: 'prl1def', is_kryptex: false },
    { name: 'prl1abc', is_kryptex: false },
  ];
  const requests = [];
  const fakeFetch = async (url) => {
    requests.push(url);
    if (url.endsWith('/topminers')) return { ok: true, json: async () => top };
    if (url.endsWith('/prl1def')) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ results: [
      { worker: 'rig/1', scheme: 'pps', status: 'online', avg_hashrate_30m: '4.2e13' },
      { worker: 'bad', scheme: 'pps', status: 'online', avg_hashrate_30m: '' },
      { worker: 'old', scheme: 'pps', status: 'offline', avg_hashrate_30m: '0' },
    ] }) };
  };
  const result = await findWorkers(40, 10, fakeFetch);
  assert.equal(requests.length, 3);
  assert.equal(result.worker.hashrateTh, 42);
  assert.equal(result.worker.status, 'online');
  assert.equal(result.worker.statsUrl, 'https://pool.kryptex.com/prl/miner/stats/prl1abc/rig%2F1/pps');
  assert.equal(result.selection, 'within_range');
  assert.equal(result.coverage.walletAccounts, 2);
  assert.equal(result.coverage.successfulAccounts, 1);
  assert.equal(result.coverage.failedAccounts[0].error, 'HTTP 503');
  assert.equal(result.coverage.examinedRecords, 3);
  assert.equal(result.coverage.invalidRecords, 1);
  assert.equal(result.coverage.completePool, false);
});

test('distingue ranking malformado de una cuenta con datos malformados', async () => {
  await assert.rejects(findWorkers(40, 10, async () => ({ ok: true, json: async () => ({}) })), /ranking/);
  const responses = [
    [{ name: 'prl1abc', is_kryptex: false }],
    { broken: [] },
  ];
  const result = await findWorkers(40, 10, async () => ({ ok: true, json: async () => responses.shift() }));
  assert.equal(result.selection, 'no_valid_workers');
  assert.match(result.coverage.failedAccounts[0].error, /results/);
});
