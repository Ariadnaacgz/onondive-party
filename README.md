# OÑONDIVE Party

Sala para ver series con tu mejor amiga (Netflix, Disney+, etc.), pensada para **tablet**.
Cada una abre su propia app de streaming con su cuenta; OÑONDIVE pone el chat y la cuenta regresiva para dar play juntas.

## Qué es real y qué no

| Función | Estado |
|---|---|
| Crear sala / entrar con código de 4 letras | Real |
| Chat en vivo | Real |
| Cuenta regresiva de play y pausa, calculada por el servidor | Real |
| Reloj compartido ("vamos en 12:34"), con ±10s/±30s y fijar tiempo | Real |
| Reacciones flotantes | Real |
| Reconexión automática a la misma sala | Real |
| Controlar o leer Netflix/Disney por dentro | **No existe**: esas plataformas lo bloquean. El play lo da cada una a mano al llegar a ¡PLAY! |
| Sincronización automática de video | Pendiente (requiere extensión de Chrome en PC, no funciona en tablet) |
| Videollamada | Pendiente |

## Cómo se usa con tu amiga

1. Una crea la sala y manda el link con **Invitar**; la otra lo abre y pone su nombre.
2. Cada una abre Netflix/Disney+ con su cuenta, en pantalla dividida (split view) con OÑONDIVE, o alternando de app.
3. Pónganse en el mismo minuto y toquen **Play juntas**. Cuando salga **¡PLAY!**, cada una da play en su app.
4. Si se desfasan, miren el tiempo en Netflix y usen **Fijar** para que el reloj de la sala coincida.

## Ejecutar en Windows

Necesitas Node.js 18 o superior.

```
cd onondive-party
npm install
npm start
```

Abre http://localhost:3000. Para probar con la tablet en tu misma red Wi-Fi, abre `http://IP-DE-TU-PC:3000` (busca la IP con `ipconfig`).
Para que tu amiga entre desde su casa, hay que publicarlo (ver abajo).

Prueba automática del servidor (dos clientes simulados por socket, sin navegador): `npm test`.

## Publicarlo (gratis)

Cualquier hosting de Node con WebSockets sirve (Render, Railway, Fly.io). Con Render:
1. Sube la carpeta a un repositorio de GitHub.
2. Nuevo "Web Service", comando de build `npm install`, comando de inicio `npm start`.
3. Usa el link `https://...onrender.com` en las tablets. En el plan gratis el servicio se duerme tras un rato sin uso: el primer acceso tarda unos segundos.

En la tablet puedes usar "Añadir a pantalla de inicio" para abrirla como app.

## Notas técnicas

- No necesita `.env` ni secretos.
- Las salas viven en memoria: si el servidor se reinicia se pierden (los clientes reconectan y recrean la sala con el mismo código, sin historial de chat).
- Máximo 8 personas por sala; el chat guarda los últimos 100 mensajes.
- Cualquiera con el código puede entrar a la sala: no compartas el link en público.
