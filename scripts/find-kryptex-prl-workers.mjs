import { pathToFileURL } from 'node:url';

const origin = 'https://pool.kryptex.com';

export function parseArguments(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--target', '--margin'].includes(key) || key in values || args[i + 1] === undefined || args[i + 1].trim() === '') {
      throw new Error('Uso: node scripts/find-kryptex-prl-workers.mjs --target 40 --margin 10');
    }
    values[key] = Number(args[i + 1]);
  }
  const target = values['--target'];
  const margin = values['--margin'];
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(margin) || margin < 0 || !Number.isFinite(target + margin)) {
    throw new Error('El objetivo debe ser positivo y el margen no negativo; ambos deben ser números finitos.');
  }
  return { target, margin };
}

export function chooseWorker(workers, target, margin) {
  workers = workers.filter(worker => worker.status === 'online');
  const compare = (a, b) => Math.abs(a.hashrateTh - target) - Math.abs(b.hashrateTh - target)
    || a.id.localeCompare(b.id, 'en');
  const inRange = workers.filter((worker) => worker.hashrateTh >= target && worker.hashrateTh <= target + margin);
  const candidates = inRange.length ? inRange : workers;
  return {
    selection: candidates.length ? (inRange.length ? 'within_range' : 'nearest_outside_range') : 'no_valid_workers',
    worker: [...candidates].sort(compare)[0] ?? null,
  };
}

export async function findWorkers(target, margin, fetchImpl = fetch) {
  async function getJson(url) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  const top = await getJson(`${origin}/prl/api/v1/pool/topminers`);
  if (!Array.isArray(top)) throw new Error('La respuesta del ranking no es una lista.');
  const addresses = [...new Set(top.filter((item) => typeof item?.name === 'string' && /^prl1[0-9a-z]+$/.test(item.name) && item.is_kryptex === false).map((item) => item.name))];
  const workers = [];
  const failedAccounts = [];
  let successfulAccounts = 0;
  let examinedRecords = 0;
  let invalidRecords = 0;

  for (const address of addresses) {
    try {
      const data = await getJson(`${origin}/prl/api/v3/miner/workers/${encodeURIComponent(address)}`);
      if (!data || !Array.isArray(data.results)) throw new Error('La respuesta no contiene una lista results.');
      successfulAccounts += 1;
      examinedRecords += data.results.length;
      for (const record of data.results) {
        const rawHashrate = record?.avg_hashrate_30m;
        const hash = (typeof rawHashrate === 'number' || (typeof rawHashrate === 'string' && rawHashrate.trim() !== '')) ? Number(rawHashrate) : NaN;
        if (typeof record?.worker !== 'string' || !record.worker || typeof record.scheme !== 'string' || !record.scheme || typeof record.status !== 'string' || !Number.isFinite(hash) || hash < 0) {
          invalidRecords += 1;
          continue;
        }
        const encoded = [address, record.worker, record.scheme].map(encodeURIComponent).join('/');
        workers.push({
          id: `${address}/${record.worker}/${record.scheme}`,
          address,
          name: record.worker,
          scheme: record.scheme,
          status: record.status,
          hashrateTh: hash / 1e12,
          statsUrl: `${origin}/prl/miner/stats/${encoded}`,
        });
      }
    } catch (error) {
      failedAccounts.push({ address, error: error.message });
    }
  }

  return {
    targetTh: target,
    marginTh: margin,
    rangeTh: [target, target + margin],
    hashratePeriod: '30 minutos',
    ...chooseWorker(workers, target, margin),
    coverage: {
      scope: 'Cuentas PRL públicas del ranking Top Miners; no representa todo el pool.',
      rankingRequests: 1,
      rankingEntries: top.length,
      walletAccounts: addresses.length,
      attemptedAccounts: addresses.length,
      successfulAccounts,
      failedAccounts,
      examinedRecords,
      validWorkers: workers.length,
      onlineWorkers: workers.filter(worker => worker.status === 'online').length,
      invalidRecords,
      completePool: false,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { target, margin } = parseArguments(process.argv.slice(2));
    const result = await findWorkers(target, margin);
    console.log(JSON.stringify(result, null, 2));
    if (result.coverage.failedAccounts.length || result.coverage.walletAccounts === 0 || result.coverage.validWorkers === 0) process.exitCode = 1;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
