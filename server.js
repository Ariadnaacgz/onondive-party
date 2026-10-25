// OÑONDIVE Party - servidor de salas (Express + Socket.IO)
// El servidor es la única fuente de verdad del reloj: nadie decide la hora por su cuenta.
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.send('ok'));

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_MEMBERS = 8;
const MAX_CHAT = 100;
const rooms = new Map();

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function makeRoom(code) {
  return {
    code,
    members: new Map(), // socket.id -> nombre
    chat: [],
    // clock: elapsed(t) = running ? base + (t - startedAt) : base
    clock: { state: 'paused', base: 0, startedAt: 0, pending: null },
    timer: null,
    cleanup: null,
  };
}

function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
}

function broadcastState(room) {
  io.to(room.code).emit('state', {
    code: room.code,
    members: [...room.members.values()],
    clock: room.clock,
    serverNow: Date.now(),
  });
}

function pushChat(room, msg) {
  room.chat.push(msg);
  if (room.chat.length > MAX_CHAT) room.chat.shift();
  io.to(room.code).emit('chat', msg);
}

function elapsedAt(clock, t) {
  return clock.state === 'running' ? clock.base + (t - clock.startedAt) : clock.base;
}

function applyPending(room) {
  const p = room.clock.pending;
  if (!p) return;
  room.timer = null;
  if (p.action === 'play') {
    room.clock = { state: 'running', base: room.clock.base, startedAt: p.at, pending: null };
  } else {
    room.clock = { state: 'paused', base: Math.max(0, elapsedAt(room.clock, p.at)), startedAt: 0, pending: null };
  }
  io.to(room.code).emit('fired', { action: p.action });
  broadcastState(room);
}

io.on('connection', (socket) => {
  let room = null;
  let lastMsgAt = 0;

  socket.on('ping', (cb) => typeof cb === 'function' && cb(Date.now()));

  socket.on('join', ({ code, name, create } = {}, cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    name = cleanName(name);
    if (!name) return cb({ ok: false, error: 'Escribe tu nombre.' });

    code = String(code || '').toUpperCase().trim();
    let r;
    if (create && !code) {
      code = newCode();
      r = makeRoom(code);
      rooms.set(code, r);
    } else {
      r = rooms.get(code);
      if (!r && create) { r = makeRoom(code); rooms.set(code, r); } // reconexión tras reinicio del servidor
      if (!r) return cb({ ok: false, error: 'Esa sala no existe. Revisa el código.' });
    }
    if (r.members.size >= MAX_MEMBERS) return cb({ ok: false, error: 'La sala está llena.' });

    if (room) leave();
    room = r;
    if (room.cleanup) { clearTimeout(room.cleanup); room.cleanup = null; }
    socket.join(room.code);
    room.members.set(socket.id, name);
    cb({ ok: true, code: room.code, chat: room.chat });
    pushChat(room, { system: true, text: `${name} entró a la sala`, at: Date.now() });
    broadcastState(room);
  });

  socket.on('chat', (text) => {
    if (!room) return;
    const now = Date.now();
    if (now - lastMsgAt < 200) return; // freno básico contra spam
    lastMsgAt = now;
    text = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500);
    if (!text) return;
    pushChat(room, { name: room.members.get(socket.id), text, at: now });
  });

  socket.on('react', (emoji) => {
    if (!room) return;
    const ok = ['😂', '😱', '😍', '😭', '👏', '🔥'];
    if (ok.includes(emoji)) io.to(room.code).emit('react', { emoji, name: room.members.get(socket.id) });
  });

  socket.on('countdown', ({ action, seconds } = {}) => {
    if (!room || room.clock.pending) return;
    if (action !== 'play' && action !== 'pause') return;
    if (action === 'play' && room.clock.state !== 'paused') return;
    if (action === 'pause' && room.clock.state !== 'running') return;
    seconds = Math.min(30, Math.max(3, parseInt(seconds, 10) || 5));
    const now = Date.now();
    const at = now + seconds * 1000;
    room.clock = { ...room.clock, pending: { action, at, by: room.members.get(socket.id) } };
    room.timer = setTimeout(() => applyPending(room), seconds * 1000);
    broadcastState(room);
  });

  socket.on('cancel', () => {
    if (!room || !room.clock.pending) return;
    clearTimeout(room.timer);
    room.timer = null;
    room.clock = { ...room.clock, pending: null };
    broadcastState(room);
  });

  // Ajuste del tiempo: delta en ms (+/-) o fijar un valor exacto en ms
  socket.on('adjust', ({ deltaMs, setMs } = {}) => {
    if (!room || room.clock.pending) return;
    const now = Date.now();
    const cur = elapsedAt(room.clock, now);
    let next = cur;
    if (Number.isFinite(setMs)) next = setMs;
    else if (Number.isFinite(deltaMs)) next = cur + deltaMs;
    next = Math.min(24 * 3600 * 1000, Math.max(0, next));
    room.clock = room.clock.state === 'running'
      ? { ...room.clock, base: next, startedAt: now }
      : { ...room.clock, base: next };
    broadcastState(room);
  });

  function leave() {
    if (!room) return;
    const name = room.members.get(socket.id);
    room.members.delete(socket.id);
    socket.leave(room.code);
    if (room.members.size === 0) {
      const dead = room;
      dead.cleanup = setTimeout(() => {
        clearTimeout(dead.timer);
        rooms.delete(dead.code);
      }, 10 * 60 * 1000); // la sala vive 10 min vacía por si se reconectan
    } else {
      pushChat(room, { system: true, text: `${name} salió de la sala`, at: Date.now() });
      broadcastState(room);
    }
    room = null;
  }

  socket.on('leave', leave);
  socket.on('disconnect', leave);
});

server.listen(PORT, () => console.log(`OÑONDIVE Party escuchando en http://localhost:${PORT}`));
