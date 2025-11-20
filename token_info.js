// token_info.js — diagnóstico de permisos y alcance de un token de Wialon
// npm i dotenv node-fetch
import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

const API   = process.env.WIALON_API || 'https://hst-api.wialon.com/wialon/ajax.html';
const TOKEN = process.env.WIALON_TOKEN;

if (!TOKEN) {
  console.error('❌ Falta WIALON_TOKEN en .env');
  process.exit(1);
}

async function wialon(svc, params, sid) {
  const url = `${API}?svc=${svc}&params=${encodeURIComponent(JSON.stringify(params||{}))}${sid ? `&sid=${sid}`:''}`;
  const res = await fetch(url);
  return res.json();
}

function section(title) {
  console.log(`\n${'='.repeat(50)}\n🔹 ${title}\n${'='.repeat(50)}`);
}

(async () => {
  console.log('🔐 Probando token en Wialon…');

  // 1️⃣ LOGIN
  const login = await wialon('token/login', { token: TOKEN });
  if (!login?.eid) {
    console.error('❌ Error de login:', login);
    process.exit(1);
  }
  const sid = login.eid;
  const user = login.user || {};
  section('Login OK');
  console.log(`SID: ${sid}`);
  console.log(`Usuario: ${user.nm} (id: ${user.id})`);
  console.log(`Nivel: ${user.prp || 'Desconocido'}`);

  // 2️⃣ TOKEN INFO
  const info = await wialon('token/check_token', { token: TOKEN });
  section('Información del Token');
  console.log(JSON.stringify(info, null, 2));

  // 3️⃣ INVENTARIO DE OBJETOS
  const inv = await wialon('core/search_items', {
    spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
    force: 1,
    flags: 1,
    from: 0, to: 0
  }, sid);
  section('Unidades');
  console.log(`Total: ${inv?.items?.length || 0}`);
  inv?.items?.slice(0, 10).forEach(u => console.log(`  • ${u.nm} (id:${u.id})`));

  const res = await wialon('core/search_items', {
    spec: { itemsType: 'avl_resource', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
    force: 1,
    flags: 1,
    from: 0, to: 0
  }, sid);
  section('Recursos');
  console.log(`Total: ${res?.items?.length || 0}`);
  res?.items?.slice(0, 10).forEach(r => console.log(`  • ${r.nm} (id:${r.id})`));

  // 4️⃣ DETALLES DE UN RECURSO (si existe)
  if (res?.items?.length) {
    const first = res.items[0];
    section(`Recurso: ${first.nm} (id:${first.id})`);

    const zones = await wialon('resource/get_zones', { resourceId: first.id, flags: 1 }, sid);
    console.log(`Geocercas: ${zones?.zones ? Object.keys(zones.zones).length : 0}`);

    const notif = await wialon('resource/get_notifications', { resourceId: first.id }, sid);
    console.log(`Notificaciones: ${Array.isArray(notif) ? notif.length : 0}`);

    const reports = await wialon('report/get_report_templates', { resourceId: first.id }, sid);
    console.log(`Plantillas de reporte: ${Array.isArray(reports) ? reports.length : 0}`);

    const drv = await wialon('resource/get_drivers', { resourceId: first.id }, sid);
    console.log(`Conductores: ${drv ? Object.keys(drv).length : 0}`);

    const trl = await wialon('resource/get_trailers', { resourceId: first.id }, sid);
    console.log(`Remolques: ${trl ? Object.keys(trl).length : 0}`);
  }

  // 5️⃣ PERMISOS BÁSICOS (user/permissions)
  const perm = await wialon('user/get_account_data', {}, sid);
  section('Datos de cuenta / permisos');
  console.log(JSON.stringify(perm, null, 2));

  // 6️⃣ LOGOUT
  await wialon('core/logout', {}, sid);
  console.log('\n✅ Sesión cerrada.\n');
})();

