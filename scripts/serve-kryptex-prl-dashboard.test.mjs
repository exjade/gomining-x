import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardServer, fetchWorkerSnapshot, fetchWorkerCharts } from './serve-kryptex-prl-dashboard.mjs';

test('snapshot normaliza estadísticas reales y selecciona esquema exacto', async () => {
  const record={worker:'A100',scheme:'pps',status:'online',avg_hashrate_30m:'4e13',avg_hashrate_24h:'1.68e14',agent:'krig/1.5.11',valid:805,stale:3,invalid:0,last_share:1793750859905};
  const fake=async()=>({ok:true,headers:new Headers(),json:async()=>({results:[{...record,scheme:'solo'},record]})});
  const read=()=>fetchWorkerSnapshot({address:'prl1abc',name:'A100',scheme:'pps'},fake);
  const {metrics:m}=await read();assert.equal(m.hashrateTh,40);assert.equal(m.hashrate24hTh,168);assert.equal(m.miner,record.agent);assert.equal(m.mode,'pps');assert.equal(m.valid,805);assert.equal(m.lastShare,new Date(record.last_share).toISOString());
  record.last_share='bad';record.agent=null;assert.equal((await read()).metrics.lastShare,null);assert.equal((await read()).metrics.miner,null);
  await assert.rejects(fetchWorkerSnapshot({address:'prl1abc',name:'missing',scheme:'pps'},fake),/no encontrado/);
});

test('chart usa series observadas y conserva ausencia de series', async () => {
  const fake=async url=>{assert.match(url,/\/api\/v1\/miner\/chart\/prl1abc\/A100\/pps\?days=1$/);return {ok:true,json:async()=>[{timestamp:2000,avg_hashrate_30m:'4e13',valid:3},{timestamp:1000,avg_hashrate_30m:3e13,avg_hashrate_3h:2e13,valid:2,stale:0,invalid:0}]};};
  const {points}=await fetchWorkerCharts({address:'prl1abc',name:'A100',scheme:'pps'},fake);
  assert.equal(points[0].timestamp,1000);assert.equal(points[1].avg_hashrate_30m,4e13);assert.equal(points[1].avg_hashrate_3h,null);assert.equal(points[1].invalid,null);
  await assert.rejects(fetchWorkerCharts({address:'prl1abc',name:'A100',scheme:'pps'},async()=>({ok:true,json:async()=>({})})),/inválido/);
});

test('stream sigue solamente al worker y se detiene al cerrar', async () => {
  let reads=0;
  const server=createDashboardServer(()=>{throw new Error('No debe escanear');},async selected=>{reads++;assert.equal(selected.name,'as');return {receivedAt:new Date().toISOString(),metrics:{hashrateTh:40}};},10);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const controller=new AbortController();
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/watch?address=prl1abc&name=as&scheme=pps`,{signal:controller.signal});
    assert.match(response.headers.get('content-type'),/event-stream/);
    const reader=response.body.getReader();let text='';
    while(reads<2){text+=new TextDecoder().decode((await reader.read()).value);}
    assert.match(text,/hashrateTh/);controller.abort();await new Promise(r=>setTimeout(r,30));const count=reads;await new Promise(r=>setTimeout(r,30));assert.equal(reads,count);
  } finally {controller.abort();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('stream se recupera de error upstream y comunica cambio offline sin escanear', async () => {
  let reads=0;
  const server=createDashboardServer(()=>{throw new Error('No escanear');},async()=>{reads++;if(reads===1)throw new Error('fallo temporal');return {receivedAt:new Date().toISOString(),metrics:{status:reads===2?'online':'offline',hashrateTh:40,hashrate24hTh:42,miner:'krig',valid:10}};},5);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const controller=new AbortController();
  try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/watch?address=prl1abc&name=as&scheme=pps`,{signal:controller.signal});const reader=response.body.getReader();let text='';while(!text.includes('offline')){text+=new TextDecoder().decode((await reader.read()).value);}assert.match(text,/upstream-error/);assert.match(text,/online/);assert.match(text,/hashrate24hTh/);}
  finally{controller.abort();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('sirve el visor y valida las consultas', async () => {
  const calls = [];
  const server = createDashboardServer(async (target, margin) => { calls.push([target, margin]); return { selection: 'within_range' }; });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /Buscador de workers/);
    const response = await fetch(`${base}/api/search?target=40&margin=10`); const body = await response.json();
    assert.equal(response.status, 200); assert.deepEqual(calls, [[40, 10]]); assert.ok(body.retrievedAt);
    assert.equal((await fetch(`${base}/api/search?target=-1&margin=10`)).status, 400);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('comunica fallos de Kryptex', async () => {
  const server = createDashboardServer(async () => { throw new Error('falló la consulta'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { const response = await fetch(`http://127.0.0.1:${server.address().port}/api/search?target=40&margin=10`); assert.equal(response.status, 502); assert.match((await response.json()).error, /falló/); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
