// Prueba real contra el servidor: dos clientes, sala, chat, cuenta regresiva y reloj compartido.
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) failed++; };
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));

(async () => {
  const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const a = io(URL), b = io(URL);
  await Promise.all([new Promise((r) => a.on('connect', r)), new Promise((r) => b.on('connect', r))]);

  const ra = await emit(a, 'join', { name: 'Ana', create: true });
  check(ra.ok && /^[A-Z]{4}$/.test(ra.code), `Ana crea sala ${ra.code}`);
  const bad = await emit(b, 'join', { name: 'Bea', code: 'ZZZZ' });
  check(!bad.ok, 'código inexistente se rechaza');

  let lastB = null, chatB = [], fired = [];
  b.on('state', (s) => (lastB = s));
  b.on('chat', (m) => chatB.push(m));
  a.on('fired', (f) => fired.push(['a', Date.now(), f.action]));
  b.on('fired', (f) => fired.push(['b', Date.now(), f.action]));

  const rb = await emit(b, 'join', { name: 'Bea', code: ra.code });
  check(rb.ok, 'Bea entra con el código');
  await sleep(150);
  check(lastB && lastB.members.length === 2, 'ambas aparecen en la sala');

  a.emit('chat', 'hola amiga');
  await sleep(200);
  check(chatB.some((m) => m.text === 'hola amiga' && m.name === 'Ana'), 'el chat llega a Bea');

  a.emit('countdown', { action: 'play', seconds: 3 });
  await sleep(200);
  check(lastB.clock.pending && lastB.clock.pending.action === 'play', 'Bea ve la cuenta regresiva');
  await sleep(3200);
  check(lastB.clock.state === 'running', 'tras la cuenta el reloj corre');
  const fa = fired.find((f) => f[0] === 'a'), fb = fired.find((f) => f[0] === 'b');
  check(fa && fb && Math.abs(fa[1] - fb[1]) < 100, `¡PLAY! llega a ambas casi a la vez (${fb && fa ? Math.abs(fa[1] - fb[1]) : '?'} ms)`);

  a.emit('adjust', { setMs: 60000 });
  await sleep(200);
  const el = lastB.clock.base + (Date.now() - lastB.clock.startedAt);
  check(Math.abs(el - 60200) < 600, 'fijar tiempo a 01:00 se refleja en Bea');

  b.emit('countdown', { action: 'pause', seconds: 3 });
  await sleep(3300);
  check(lastB.clock.state === 'paused' && lastB.clock.base >= 63000 && lastB.clock.base < 65500, `pausa guarda el tiempo (${Math.round(lastB.clock.base / 1000)} s)`);

  b.emit('countdown', { action: 'play', seconds: 5 });
  await sleep(200);
  b.emit('cancel');
  await sleep(200);
  check(lastB.clock.pending === null && lastB.clock.state === 'paused', 'cancelar la cuenta funciona');

  a.close(); b.close(); srv.kill();
  console.log(failed ? `\n${failed} prueba(s) fallaron` : '\nTodo en orden');
  process.exit(failed ? 1 : 0);
})();
