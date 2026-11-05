# Buscar workers PRL en Kryptex

Requiere Node.js 18 o posterior y acceso a internet:

```powershell
node scripts/find-kryptex-prl-workers.mjs --target 40 --margin 10
```

El objetivo y el margen se expresan en TH/s. El ejemplo busca dentro del intervalo inclusivo de 40 a 50 TH/s y selecciona el valor más cercano a 40. Si no encuentra uno en el intervalo, devuelve el más cercano de todos los registros válidos examinados. En caso de empate, ordena por dirección, nombre y esquema. La salida JSON identifica el worker, su estado, su velocidad y la URL de su página individual de estadísticas.

La velocidad es `avg_hashrate_30m`, el promedio de 30 minutos publicado por Kryptex en H/s convertido a TH/s. Es una medición variable; la página puede mostrar otros promedios. Se incluyen los registros online y offline recibidos, con su estado visible.

La selección ahora usa exclusivamente registros `online`: si no hay ninguno dentro del rango, devuelve el online más cercano; si todos están offline no selecciona ninguno. La cobertura conserva el conteo total de registros válidos y añade `onlineWorkers`.

El visor muestra Name, Mode, 30 min., 24 hours, Valid, Stale, Invalid y Miner del worker seguido. Si pasa a offline se muestra su estado real y se conserva su identidad. El histórico de las últimas 24 horas se consulta cada minuto por separado y muestra las series originales `avg_hashrate_30m`, `avg_hashrate_3h` y los contadores por intervalo `valid`, `stale`, `invalid`. Los puntos observados están separados por diez minutos; esa resolución histórica no determina la frecuencia del seguimiento ni tiene relación con los pagos. No se inventan puntos intermedios ni series ausentes.

El programa consulta el [ranking público de PRL](https://pool.kryptex.com/prl/top-miners) y después los workers de cada dirección PRL que aparece en él, a través de la [API de Kryptex](https://pool.kryptex.com/uk/api). Las entradas agregadas de Kryptex Miner y Auto-convert se excluyen porque no son direcciones PRL enumerables. El ranking no demuestra contener todas las cuentas del pool: el resultado es el más cercano **entre los registros válidos efectivamente examinados**, no necesariamente de todo Kryptex.

La respuesta de workers observada contiene una lista `results` sin metadatos de paginación; se hace una consulta por dirección y no se presume cobertura completa. La sección `coverage` muestra cuentas, registros inválidos y errores. Si una cuenta falla, se devuelve el mejor resultado parcial, se informa qué cuenta falló y el proceso termina con código 1. Una respuesta general fallida, ausencia de cuentas o ausencia de workers válidos también produce código 1. `no_valid_workers` no demuestra que no haya workers en el pool.

Ejecutar pruebas:

```powershell
node --test scripts/find-kryptex-prl-workers.test.mjs
```

## Visor local

Desde la raíz del proyecto ejecuta `node scripts/serve-kryptex-prl-dashboard.mjs` y abre http://127.0.0.1:4174/ en el navegador. Mantén la terminal abierta. La búsqueda global ocurre al pulsar Buscar. Después se sigue exclusivamente la cuenta y worker seleccionados mediante HTTP, cinco segundos después de completar cada consulta. SSE mantiene una conexión continua entre servidor local y navegador. Esto no demuestra push upstream de Kryptex; el endpoint JSON probado no devolvió Cache-Control. El hashrate sigue siendo el promedio móvil de 30 minutos. Los errores conservan el último dato y el seguimiento reintenta automáticamente.
