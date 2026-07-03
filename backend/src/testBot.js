require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const ioClient = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { bestHand } = require('./engine/variants/holdem/handEvaluator');

const TABLE_ID = process.argv[2] || 'b5e86015-0fdd-4bcb-b90f-f3740af3997a';
const NICKNAME = process.argv[3] || 'Bot_Carlos';
const { createHash } = require('crypto');
const h = createHash('md5').update(NICKNAME).digest('hex');
const BOT_ID = process.argv[4] || `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
const token = jwt.sign({ id: BOT_ID, nickname: NICKNAME, is_admin: 0 }, process.env.JWT_SECRET, { expiresIn: '12h' });

const socket = ioClient('http://localhost:4000', { auth: { token }, transports: ['websocket', 'polling'] });

// ── Bot state ─────────────────────────────────────
let myCards = [];
let community = [];
let currentBet = 0;
let lastRaiseSize = 10;
let myStreetBet = 0;
let myStack = 0;
let pot = 0;
let phase = 'waiting';

// ── Hand strength (0..10) ─────────────────────────
function preflopStrength(cards) {
  if (cards.length < 2) return 0;
  const [a, b] = cards;
  const hi = Math.max(a.value, b.value);
  const lo = Math.min(a.value, b.value);
  const suited = a.suit === b.suit;
  const gap = hi - lo;

  if (a.value === b.value) {
    // Pocket pair: 22 → 4, AA → 10
    return 4 + (a.value - 2) * 0.5;
  }
  let s = 0;
  if (hi === 14) s = 4;        // Ace high
  else if (hi === 13) s = 3;   // King high
  else if (hi === 12) s = 2.5;
  else if (hi >= 10) s = 2;
  else s = 1;
  if (suited) s += 1;
  if (gap === 1) s += 1;       // connectors
  else if (gap === 2) s += 0.5;
  if (lo >= 10) s += 1;        // both broadway
  return Math.min(s, 9);
}

function postflopStrength() {
  const hand = bestHand([...myCards, ...community]);
  if (!hand) return 0;
  // rank 1=high card ... 10=royal → map to 0..10 with kicker bonus
  let s = (hand.rank - 1) * 1.6;
  if (hand.rank === 1 && hand.tiebreakers[0] >= 13) s += 0.8; // K/A high
  return Math.min(s, 10);
}

// ── Draw detection (flush / open-ended straight) ──
function detectDraws() {
  if (community.length < 3 || community.length >= 5) return { flush: false, straight: false };
  const all = [...myCards, ...community];

  // Flush draw: 4 of the same suit (and at least 1 of mine)
  const suitCount = {};
  for (const c of all) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
  const flushSuit = Object.keys(suitCount).find(s => suitCount[s] === 4);
  const flush = !!flushSuit && myCards.some(c => c.suit === flushSuit);

  // Open-ended straight draw: 4 consecutive values
  const vals = [...new Set(all.map(c => c.value))].sort((a, b) => a - b);
  let straight = false;
  for (let i = 0; i <= vals.length - 4; i++) {
    if (vals[i + 3] - vals[i] === 3 && vals[i] >= 2 && vals[i + 3] <= 13) {
      straight = true;
      break;
    }
  }
  return { flush, straight };
}

function decide() {
  const owed = Math.max(0, currentBet - myStreetBet);
  const postflop = community.length >= 3;
  let strength = postflop ? postflopStrength() : preflopStrength(myCards);

  // Draws are worth chasing (and semi-bluffing with)
  const draws = postflop ? detectDraws() : { flush: false, straight: false };
  const hasDraw = draws.flush || draws.straight;
  if (draws.flush) strength += 2.5;   // ~35% to hit by river
  if (draws.straight) strength += 2;  // ~31%

  // ── No bet to face ──
  if (owed === 0) {
    const raiseTo = currentBet + lastRaiseSize;
    const canBet = myStack > lastRaiseSize;

    // Value bet strong hands (55%)
    if (postflop && strength >= 4.5 && Math.random() < 0.55 && canBet) {
      return { type: 'raise', amount: raiseTo };
    }
    // Semi-bluff draws (35%) — win now or improve later
    if (hasDraw && Math.random() < 0.35 && canBet) {
      return { type: 'raise', amount: raiseTo };
    }
    // Pure bluff (10%) — keep opponents honest
    if (postflop && Math.random() < 0.10 && canBet) {
      return { type: 'raise', amount: raiseTo };
    }
    // Preflop open-raise with premium hands (50%)
    if (!postflop && strength >= 6 && Math.random() < 0.5 && canBet) {
      return { type: 'raise', amount: raiseTo };
    }
    return { type: 'check' };
  }

  // ── Facing a bet ──
  // Raise with monsters (40%)
  const raiseThreshold = postflop ? 6 : 7;
  if (strength >= raiseThreshold && Math.random() < 0.4 && myStack > owed + lastRaiseSize) {
    return { type: 'raise', amount: currentBet + lastRaiseSize };
  }

  // Real pot odds: price vs estimated equity
  const price = owed / Math.max(pot + owed, 1);     // % of final pot we pay
  const equity = Math.min(strength / 11, 0.9);      // rough win estimate
  if (equity >= price) return { type: 'call' };

  // Cheap calls with any playable hand
  if (owed <= 10 && strength >= 1) return { type: 'call' };

  return { type: 'fold' };
}

// ── Socket wiring ─────────────────────────────────
socket.on('connect', () => {
  console.log(`[${NICKNAME}] Connected, joining...`);
  socket.emit('join_table', { tableId: TABLE_ID, buyIn: 200 });
});

socket.on('connect_error', (err) => console.error(`[${NICKNAME}] connect error:`, err.message));

socket.on('table_state', (s) => {
  phase = s.phase;
  currentBet = s.currentBet || 0;
  lastRaiseSize = s.lastRaiseSize || 10;
  pot = s.pot || 0;
  community = s.community || [];
  const me = s.seats?.find(x => x.playerId === BOT_ID);
  if (me) { myStack = me.stack; myStreetBet = me.currentStreetBet || 0; }
  if (s.phase === 'pre_flop') community = s.community || [];
});

socket.on('cards_dealt', (d) => {
  myCards = d.holeCards;
  myStreetBet = 0;
  console.log(`[${NICKNAME}] Cards:`, myCards.map(c => c.rank + c.suit).join(' '));
});

socket.on('community_updated', ({ community: c, phase: p }) => {
  community = c.filter(x => x && x.rank);
  phase = p;
  myStreetBet = 0;
  currentBet = 0;
});

socket.on('action_broadcast', ({ playerId, stack, streetBet, currentBet: cb, pot: p }) => {
  if (cb !== undefined) currentBet = cb;
  if (p !== undefined) pot = p;
  if (playerId === BOT_ID) {
    if (stack !== undefined) myStack = stack;
    if (streetBet !== undefined) myStreetBet = streetBet;
  }
});

socket.on('pot_updated', ({ pot: p }) => { if (p !== undefined) pot = p; });

socket.on('action_required', (a) => {
  if (a.playerId !== BOT_ID) return;
  setTimeout(() => {
    const action = decide();
    console.log(`[${NICKNAME}] ${action.type}${action.amount ? ' to ' + action.amount : ''} (street: ${phase})`);
    socket.emit('game_action', { tableId: TABLE_ID, ...action });
  }, 1200 + Math.random() * 800);
});

socket.on('error', (e) => {
  // Fallbacks if our local state drifted
  if (e.code === 'INVALID_ACTION') {
    if (e.message?.includes('igualar')) {
      socket.emit('game_action', { tableId: TABLE_ID, type: 'call' });
    } else if (e.message?.includes('pasar')) {
      socket.emit('game_action', { tableId: TABLE_ID, type: 'check' });
    } else if (e.message?.includes('mínima')) {
      socket.emit('game_action', { tableId: TABLE_ID, type: 'call' });
    }
  } else {
    console.log(`[${NICKNAME}] error:`, JSON.stringify(e));
  }
});

socket.on('hand_ended', (r) => {
  console.log(`[${NICKNAME}] Hand ended:`, JSON.stringify(r.winners?.map(w => ({ nick: w.nickname, amount: w.amount, hand: w.handName }))));
  myCards = [];
  community = [];
});

console.log(`[${NICKNAME}] Starting bot for table`, TABLE_ID);
