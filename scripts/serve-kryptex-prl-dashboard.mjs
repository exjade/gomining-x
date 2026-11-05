import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { findWorkers, parseArguments } from './find-kryptex-prl-workers.mjs';

export function createDashboardServer(finder = findWorkers, reader = fetchWorkerSnapshot, interval = 5000) {
  return createServer(async (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/chart') {
      const selected = Object.fromEntries(['address', 'name', 'scheme'].map(key => [key, url.searchParams.get(key)]));
      if (!selected.address || !/^prl1[0-9a-z]+$/.test(selected.address) || !selected.name || !selected.scheme) { res.writeHead(400); res.end(); return; }
      try { const chart = await fetchWorkerCharts(selected); res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(chart)); }
      catch (error) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
      return;
    }
    if (url.pathname === '/api/watch') {
      const address = url.searchParams.get('address');
      const name = url.searchParams.get('name');
      const scheme = url.searchParams.get('scheme');
      if (!address || !/^prl1[0-9a-z]+$/.test(address) || !name || !scheme) { res.writeHead(400); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.flushHeaders();
      let closed = false, timer, previous, changedAt;
      res.on('close', () => { closed = true; clearTimeout(timer); });
      async function tick() {
        const attemptedAt = new Date().toISOString();
        try {
          const snapshot = await reader({ address, name, scheme });
          const signature = JSON.stringify(snapshot.metrics);
          if (signature !== previous) { changedAt = snapshot.receivedAt; previous = signature; }
          if (!closed) res.write(`data: ${JSON.stringify({ ...snapshot, attemptedAt, changedAt, transport: 'HTTP polling', intervalMs: interval })}\n\n`);
        } catch (error) { if (!closed) res.write(`event: upstream-error\ndata: ${JSON.stringify({ error: error.message, attemptedAt })}\n\n`); }
        if (!closed) timer = setTimeout(tick, interval);
      }
      tick(); return;
    }
    if (url.pathname === '/') {
      const html = await readFile(new URL('./kryptex-prl-dashboard/index.html', import.meta.url));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html); return;
    }
    if (url.pathname !== '/api/search') { res.writeHead(404); res.end(); return; }
    let options;
    try { options = parseArguments(['--target', url.searchParams.get('target') ?? '', '--margin', url.searchParams.get('margin') ?? '']); }
    catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); return; }
    try {
      const result = await finder(options.target, options.margin);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ...result, retrievedAt: new Date().toISOString() }));
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message }));
    }
  });
}

export async function fetchWorkerSnapshot({ address, name, scheme }, fetchImpl = fetch) {
  const response = await fetchImpl(`https://pool.kryptex.com/prl/api/v3/miner/workers/${encodeURIComponent(address)}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Kryptex HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.results)) throw new Error('Respuesta de workers inválida');
  const record = data.results.find(item => item.worker === name && item.scheme === scheme);
  if (!record) throw new Error('Worker no encontrado en la última consulta');
  const rate = Number(record.avg_hashrate_30m);
  if (record.avg_hashrate_30m === null || record.avg_hashrate_30m === '' || !Number.isFinite(rate) || rate < 0) throw new Error('Hashrate inválido');
  const lastShare = typeof record.last_share === 'number' && record.last_share > 0 && Number.isFinite(new Date(record.last_share).getTime()) ? new Date(record.last_share).toISOString() : null;
  const counts = {};
  for (const key of ['valid', 'stale', 'invalid']) counts[key] = Number.isSafeInteger(record[key]) && record[key] >= 0 ? record[key] : null;
  const rate24 = Number(record.avg_hashrate_24h);
  const hashrate24hTh = record.avg_hashrate_24h !== null && record.avg_hashrate_24h !== undefined && record.avg_hashrate_24h !== '' && Number.isFinite(rate24) && rate24 >= 0 ? rate24 / 1e12 : null;
  return { receivedAt: new Date().toISOString(), metrics: { name: record.worker, mode: record.scheme, hashrateTh: rate / 1e12, hashrate24hTh, miner: typeof record.agent === 'string' && record.agent.trim() ? record.agent : null, status: record.status, ...counts, lastShare }, cacheControl: response.headers.get('cache-control') };
}

export async function fetchWorkerCharts({ address, name, scheme }, fetchImpl = fetch) {
  const path = [address, name, scheme].map(encodeURIComponent).join('/');
  const response = await fetchImpl(`https://pool.kryptex.com/prl/api/v1/miner/chart/${path}?days=1`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Chart HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Histórico inválido');
  const points = data.map(row => {
    if (typeof row.timestamp !== 'number' || !Number.isFinite(new Date(row.timestamp).getTime())) throw new Error('Fecha histórica inválida');
    const point = { timestamp: row.timestamp };
    for (const key of ['avg_hashrate_30m', 'avg_hashrate_3h', 'valid', 'stale', 'invalid']) {
      const value = row[key];
      point[key] = (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
    }
    return point;
  }).sort((a, b) => a.timestamp - b.timestamp);
  return { receivedAt: new Date().toISOString(), points };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createDashboardServer().listen(4174, '127.0.0.1', () => console.log('Visor: http://127.0.0.1:4174/'));
}
