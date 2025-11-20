import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const WIALON_API = process.env.WIALON_API || 'https://hst-api.wialon.com/wialon/ajax.html';
const TOKEN = process.env.WIALON_TOKEN;

if (!TOKEN) {
  console.error('❌ Falta WIALON_TOKEN en tu .env');
  process.exit(1);
}
if (!WIALON_API) {
  console.error('❌ Falta WIALON_API en tu .env');
  process.exit(1);
}

async function testWialon() {
  try {
    console.log('Probando conexión a Wialon...');
    const params = encodeURIComponent(JSON.stringify({ token: TOKEN }));
    const url = `${WIALON_API}?svc=token/login&params=${params}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data && data.eid) {
      console.log('✅ Conexión exitosa a Wialon.');
      console.log('Session ID:', data.eid);
    } else {
      console.log('❌ Error al conectar a Wialon:', data);
    }
  } catch (err) {
    console.error('Error en la prueba:', err);
  }
}

testWialon();

