'use strict';

const tables = new Map(); // tableId → Table object

function createTable({ id, name, gameType, chipMode, maxSeats, smallBlind, bigBlind, buyInMin, buyInMax }) {
  const table = {
    id,
    name,
    gameType: gameType || 'holdem',
    chipMode: chipMode || 'play',
    maxSeats: maxSeats || 6,
    smallBlind: parseFloat(smallBlind) || 5,
    bigBlind: parseFloat(bigBlind) || 10,
    buyInMin: parseFloat(buyInMin) || 100,
    buyInMax: parseFloat(buyInMax) || 1000,
    seats: Array.from({ length: maxSeats || 6 }, (_, i) => ({
      position: i,
      playerId: null,
      nickname: null,
      stack: 0,
      cards: [],
      status: 'empty',
    })),
    phase: 'waiting',
    handNumber: 0,
    dealerPosition: null,
    actionPosition: null,
    actionDeadline: null,
    currentBet: 0,
    lastRaiseSize: parseFloat(bigBlind) || 10,
    streetBets: {},
    community: [],
    deck: [],
    potManager: null,
    handLogger: null,
    actionTimeout: null,
    tournamentId: null,
    bbHasOption: false,
    bbPlayerId: null,
    sbPosition: null,
    bbPosition: null,
    // Anti-ratholing: playerId → { stack, at } for players who recently left
    recentLeavers: new Map(),
  };
  tables.set(id, table);
  return table;
}

function getTable(id) {
  return tables.get(id) || null;
}

function removeTable(id) {
  tables.delete(id);
}

function getAllTables() {
  return [...tables.values()];
}

function isPlayerSeated(table, playerId) {
  return table.seats.some(s => s.playerId === playerId);
}

function getPlayerSeat(table, playerId) {
  return table.seats.find(s => s.playerId === playerId) || null;
}

function seatPlayer(table, playerId, nickname, stack, position) {
  // Prevent double-seating — caller must check isPlayerSeated first
  if (isPlayerSeated(table, playerId)) return null;

  const seat = position !== undefined
    ? table.seats[position]
    : table.seats.find(s => s.status === 'empty');
  if (!seat) return null;
  seat.playerId = playerId;
  seat.nickname = nickname;
  seat.stack = stack;
  seat.status = 'active';
  seat.cards = [];
  return seat;
}

function standPlayer(table, playerId) {
  const seat = table.seats.find(s => s.playerId === playerId);
  if (!seat) return null;
  const stack = seat.stack;
  seat.playerId = null;
  seat.nickname = null;
  seat.stack = 0;
  seat.cards = [];
  seat.status = 'empty';
  return stack;
}

module.exports = { createTable, getTable, removeTable, getAllTables, seatPlayer, standPlayer, isPlayerSeated, getPlayerSeat };
