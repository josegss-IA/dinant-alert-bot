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

(async () => {
  try {
    console.log('🔐 Login…');
    const login = await wialonFetch('token/login', { token: TOKEN });
    if (!login?.eid) throw new Error('Login falló: ' + JSON.stringify(login));
    const sid = login.eid;

    console.log('📦 Pidiendo inventario de unidades…');
    // core/search_items: buscamos items tipo avl_unit
    const search = await wialonFetch(
      'core/search_items',
      {
        spec: {
          itemsType: 'avl_unit',
          propName: 'sys_name',
          propValueMask: '*',
          sortType: 'sys_name'
        },
        force: 1,
        // flags 1 = info básica (id, name, etc.). Suficiente para inventario rápido.
        flags: 1,
        from: 0,
        to: 0
      },
      sid
    );

    const units = search?.items || [];
    console.log(`✅ Unidades encontradas: ${units.length}`);
    units.slice(0, 50).forEach((u, i) => {
      console.log(`${String(i + 1).padStart(2, ' ')}. ${u.n} (id: ${u.id})`);
    });

    // 🔚 Logout (opcional, pero buena práctica)
    await wialonFetch('core/logout', {}, sid);
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();

