'use strict';

// Returns { valid, reason, resolvedType, resolvedAmount, isAllIn }
// `resolvedAmount` is always the number of CHIPS TO ADD from the player's stack.
// For raises, `action.amount` is "raise TO" — the total street bet the player wants.
function validateAction(table, playerId, action) {
  const seat = table.seats.find(s => s.playerId === playerId);
  if (!seat) return { valid: false, reason: 'No estás en la mesa' };
  // Guard de fase: solo se aceptan acciones mientras la mano está en juego.
  // Tras el showdown la fase es 'waiting'/'showdown' y actionPosition queda
  // obsoleto; sin esto un cliente manipulado podría descontar stack hacia un
  // PotManager recién vaciado y corromper los timers.
  if (!['pre_flop', 'flop', 'turn', 'river'].includes(table.phase)) {
    return { valid: false, reason: 'La mano no está en juego' };
  }
  if (table.actionPosition !== seat.position) return { valid: false, reason: 'No es tu turno' };
  if (seat.status !== 'active') return { valid: false, reason: 'No estás activo en la mano' };

  const myBet = table.streetBets[playerId] || 0;
  const owed = Math.max(0, (table.currentBet || 0) - myBet);
  const stack = seat.stack;
  const { type, amount } = action;

  switch (type) {
    case 'fold':
      return { valid: true, resolvedType: 'fold', resolvedAmount: 0 };

    case 'check':
      if (owed > 0) {
        return { valid: false, reason: `Debes igualar ${owed} o retirarte` };
      }
      return { valid: true, resolvedType: 'check', resolvedAmount: 0 };

    case 'call': {
      if (owed <= 0) return { valid: false, reason: 'No hay nada que igualar, puedes pasar' };
      if (stack <= 0) return { valid: false, reason: 'Sin fichas' };
      if (stack <= owed) {
        // All-in for less — allowed
        return { valid: true, resolvedType: 'call', resolvedAmount: stack, isAllIn: true };
      }
      return { valid: true, resolvedType: 'call', resolvedAmount: owed };
    }

    case 'raise': {
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
        return { valid: false, reason: 'Monto de subida inválido' };
      }
      const raiseTo = amount;                 // total street bet target
      const chipsNeeded = raiseTo - myBet;    // chips to add now
      if (chipsNeeded <= 0) {
        return { valid: false, reason: 'La subida debe superar tu apuesta actual' };
      }
      if (raiseTo <= (table.currentBet || 0)) {
        return { valid: false, reason: 'La subida debe superar la apuesta actual' };
      }

      const minRaiseTo = (table.currentBet || 0) + (table.lastRaiseSize || table.bigBlind || 10);

      if (chipsNeeded >= stack) {
        // All of the stack goes in — all-in below min-raise is allowed,
        // but it does NOT reopen the action (handled in processAction via raiseSize check)
        return { valid: true, resolvedType: 'all_in', resolvedAmount: stack, isAllIn: true };
      }
      if (raiseTo < minRaiseTo) {
        return { valid: false, reason: `La subida mínima es ${minRaiseTo}` };
      }
      return { valid: true, resolvedType: 'raise', resolvedAmount: chipsNeeded };
    }

    case 'all_in':
      if (stack <= 0) return { valid: false, reason: 'Sin fichas' };
      return { valid: true, resolvedType: 'all_in', resolvedAmount: stack, isAllIn: true };

    default:
      return { valid: false, reason: 'Acción desconocida' };
  }
}

module.exports = { validateAction };
