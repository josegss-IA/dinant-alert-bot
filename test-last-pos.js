import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API = process.env.WIALON_API || 'https://hst-api.wialon.com/wialon/ajax.html';
const TOKEN = process.env.WIALON_TOKEN;

async function wialonFetch(svc, paramsObj, sid) {
  const params = encodeURIComponent(JSON.stringify(paramsObj || {}));
  const sidPart = sid ? `&sid=${sid}` : '';
  const url = `${API}?svc=${svc}&params=${params}${sidPart}`;
  const res = await fetch(url);
  return res.json();
}

function tsToLocal(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

(async () => {
  try {
    const login = await wialonFetch('token/login', { token: TOKEN });
    if (!login?.eid) throw new Error('Login falló: ' + JSON.stringify(login));
    const sid = login.eid;

    // 1) Buscar unidades
    const search = await wialonFetch(
      'core/search_items',
      {
        spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
        force: 1,
        flags: 1,
        from: 0,
        to: 0
      },
      sid
    );
    const units = search?.items || [];
    console.log(`🛰️ Unidades: ${units.length}`);

    // 2) Pedir última posición por lotes usando core/batch + unit/get_last_message
    const BATCH_SIZE = 20;
    for (let i = 0; i < units.length; i += BATCH_SIZE) {
      const chunk = units.slice(i, i + BATCH_SIZE);

      const calls = chunk.map(u => ({
        svc: 'unit/get_last_message',
        params: { unitId: u.id }
      }));

      const batchResp = await wialonFetch('core/batch', { calls }, sid);

      chunk.forEach((u, idx) => {
        const r = batchResp?.[idx];
        const pos = r?.pos;
        const lat = pos?.y;
        const lon = pos?.x;
        const time = tsToLocal(pos?.t);
        if (lat != null && lon != null) {
          console.log(`${u.n} (id:${u.id}) -> lat:${lat}, lon:${lon}, time:${time}`);
        } else {
          console.log(`${u.n} (id:${u.id}) -> sin posición reciente`);
        }
      });
    }

    await wialonFetch('core/logout', {}, sid);
  } catch (e) {
    console.error('❌ Error:', e);
  }
})();

