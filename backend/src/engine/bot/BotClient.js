'use strict';

// Un bot = una conexión socket.io-client interna (loopback a localhost).
// Reutiliza EXACTAMENTE el mismo camino que un humano (join_table, game_action),
// así que no duplica nada del motor. La decisión la toma BotEngine según el nivel.

const ioClient = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { BotEngine } = require('./BotEngine');

class BotClient {
  constructor({ botId, nickname, level, personality, tableId, buyIn = 500, port }) {
    this.botId = botId;
    this.nickname = nickname;
    this.tableId = tableId;
    this.buyIn = buyIn;
    this.engine = new BotEngine({ level, personality });
    this.level = level;
    this.dead = false;

    // Estado de la mano (por instancia, no global)
    this.myCards = [];
    this.community = [];
    this.currentBet = 0;
    this.lastRaiseSize = 10;
    this.myStreetBet = 0;
    this.myStack = 0;
    this.pot = 0;
    this.phase = 'waiting';
    this.seats = [];
    this.dealerPosition = null;
    this.myPosition = null;
    this.bigBlind = 10;
    this.smallBlind = 5;
    this.lastAggressorNick = null;
    // Acción preflop más fuerte de cada rival en ESTA mano (nivel 12: rangos)
    this.oppPreflop = {};

    const PORT = port || process.env.PORT || 4000;
    const token = jwt.sign(
      { id: botId, nickname, is_admin: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    this.socket = ioClient(`http://localhost:${PORT}`, {
      auth: { token },
      transports: ['websocket'],
      // Reconexión automática: un microcorte ya no mata al bot para siempre.
      // Al reconectar, el handler 'connect' vuelve a emitir join_table.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    this._wire();
  }

  _nickOf(playerId) {
    return this.seats.find(s => s.playerId === playerId)?.nickname || null;
  }

  _wire() {
    const s = this.socket;

    s.on('connect', () => {
      s.emit('join_table', { tableId: this.tableId, buyIn: this.buyIn });
    });
    s.on('connect_error', (err) => console.error(`[bot ${this.nickname}] connect_error:`, err.message));

    s.on('table_state', (st) => {
      this.phase = st.phase;
      this.currentBet = st.currentBet || 0;
      this.lastRaiseSize = st.lastRaiseSize || 10;
      this.pot = st.pot || 0;
      this.community = st.community || [];
      this.seats = st.seats || [];
      this.dealerPosition = st.dealerPosition;
      this.bigBlind = st.bigBlind || 10;
      this.smallBlind = st.smallBlind || 5;
      const me = this.seats.find(x => x.playerId === this.botId);
      if (me) { this.myStack = me.stack; this.myStreetBet = me.currentStreetBet || 0; this.myPosition = me.position; }
    });

    s.on('cards_dealt', (d) => {
      this.myCards = d.holeCards || [];
      this.myStreetBet = 0;
      this.lastAggressorNick = null;
      this.oppPreflop = {};
      // Nueva mano: cuenta manos vistas de cada rival (para el modelado)
      const opps = this.seats.filter(x => x.playerId && x.playerId !== this.botId).map(x => x.nickname);
      this.engine.noteHandStart(opps);
    });

    s.on('community_updated', ({ community: c, phase: p }) => {
      this.community = (c || []).filter(x => x && x.rank);
      this.phase = p;
      this.myStreetBet = 0;
      this.currentBet = 0;
      this.lastAggressorNick = null;
    });

    s.on('action_broadcast', ({ playerId, type, stack, streetBet, currentBet, pot }) => {
      if (currentBet !== undefined) this.currentBet = currentBet;
      if (pot !== undefined) this.pot = pot;
      if (playerId === this.botId) {
        if (stack !== undefined) this.myStack = stack;
        if (streetBet !== undefined) this.myStreetBet = streetBet;
      } else {
        // Modelado de rival + registrar el último agresor
        const nick = this._nickOf(playerId);
        this.engine.observe({ nickname: nick, action: type, phase: this.phase });
        if (['raise', 'all_in'].includes(type)) this.lastAggressorNick = nick;
        // Acción preflop más fuerte de la mano (raise > call > check)
        if (this.phase === 'pre_flop' && nick) {
          const RANKING = { raise: 3, all_in: 3, call: 2, check: 1 };
          const prev = RANKING[this.oppPreflop[nick]] || 0;
          const now = RANKING[type] || 0;
          if (now > prev) this.oppPreflop[nick] = type === 'all_in' ? 'raise' : type;
        }
      }
    });

    s.on('pot_updated', ({ pot }) => { if (pot !== undefined) this.pot = pot; });

    s.on('action_required', (a) => {
      if (a.playerId !== this.botId || this.dead) return;
      this._lastRejected = null; // nuevo turno → reinicia la guardia anti-bucle
      // Piensa un rato para parecer humano (niveles altos algo más rápidos)
      const base = 1900 - (this.level - 5) * 120;
      const think = base + Math.random() * 700;
      setTimeout(() => {
        if (this.dead) return;
        const ctx = {
          myCards: this.myCards,
          community: this.community,
          currentBet: this.currentBet,
          lastRaiseSize: this.lastRaiseSize,
          myStreetBet: this.myStreetBet,
          myStack: this.myStack,
          pot: this.pot,
          phase: this.phase,
          bigBlind: this.bigBlind,
          smallBlind: this.smallBlind,
          seats: this.seats,
          myPosition: this.myPosition,
          dealerPosition: this.dealerPosition,
          lastAggressorNick: this.lastAggressorNick,
          oppPreflop: this.oppPreflop,
        };
        let action;
        try { action = this.engine.decide(ctx); }
        catch { action = { type: this.currentBet > this.myStreetBet ? 'fold' : 'check' }; }
        s.emit('game_action', { tableId: this.tableId, ...action });
      }, think);
    });

    s.on('error', (e) => {
      // Si nuestro estado local se desincronizó, corrige con lo que el server pide.
      if (e.code !== 'INVALID_ACTION' || !e.message) return;
      const m = e.message.toLowerCase();
      // OJO: "no hay nada que igualar, puedes pasar" contiene 'igualar' pero la
      // acción correcta es PASAR — por eso 'pasar' se evalúa PRIMERO.
      let fix;
      if (m.includes('pasar')) fix = 'check';
      else if (m.includes('igualar') || m.includes('mínima') || m.includes('minima')) fix = 'call';
      else return; // no sabemos corregir → no reintentar (evita bucle)
      // Guardia anti-bucle: si la misma corrección ya fue rechazada, escala a algo seguro
      if (this._lastRejected === fix) fix = fix === 'call' ? 'check' : 'fold';
      this._lastRejected = fix;
      s.emit('game_action', { tableId: this.tableId, type: fix });
    });
  }

  // Torneo multi-mesa: mover este bot a otra mesa. Reutiliza el mismo socket;
  // el join_table del servidor lo saca de la sala vieja y lo mete en la nueva.
  switchTable(newTableId) {
    this.tableId = newTableId;
    // Reiniciar estado de la mano (mesa nueva, reparto nuevo)
    this.myCards = [];
    this.community = [];
    this.myStreetBet = 0;
    this.currentBet = 0;
    this.lastAggressorNick = null;
    this.oppPreflop = {};
    this._lastRejected = null;
    try { this.socket.emit('join_table', { tableId: newTableId, buyIn: this.buyIn }); } catch {}
  }

  leave() {
    this.dead = true;
    try { this.socket.emit('leave_table', { tableId: this.tableId }); } catch {}
    setTimeout(() => { try { this.socket.disconnect(); } catch {} }, 300);
  }
}

module.exports = { BotClient };
