const mysql = require('mysql2/promise');
const pool = require('./db');

async function setupDb() {
  // Create database if not exists (connect without DB first)
  const tempConn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'pokersite'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await tempConn.end();

  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS players (
      id            CHAR(36)      NOT NULL DEFAULT (UUID()),
      email         VARCHAR(128)  UNIQUE,
      nickname      VARCHAR(32)   NOT NULL,
      password_hash VARCHAR(255),
      avatar_config JSON,
      play_chips    INT           NOT NULL DEFAULT 1000,
      real_chips    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      country       CHAR(2),
      is_admin      TINYINT(1)    NOT NULL DEFAULT 0,
      is_banned     TINYINT(1)    NOT NULL DEFAULT 0,
      created_at    DATETIME      NOT NULL DEFAULT NOW(),
      last_seen     DATETIME      NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id),
      INDEX idx_nickname (nickname),
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await conn.query(`CREATE TABLE IF NOT EXISTS tables_cash (
      id              CHAR(36)      NOT NULL DEFAULT (UUID()),
      name            VARCHAR(64)   NOT NULL,
      game_type       ENUM('holdem','omaha','five_card_draw','seven_card_stud') NOT NULL DEFAULT 'holdem',
      chip_mode       ENUM('play','real') NOT NULL DEFAULT 'play',
      max_seats       TINYINT       NOT NULL DEFAULT 6,
      small_blind     DECIMAL(10,2) NOT NULL DEFAULT 5,
      big_blind       DECIMAL(10,2) NOT NULL DEFAULT 10,
      buy_in_min      DECIMAL(10,2) NOT NULL DEFAULT 100,
      buy_in_max      DECIMAL(10,2) NOT NULL DEFAULT 1000,
      rake_percent    DECIMAL(4,2)  NOT NULL DEFAULT 5.00,
      rake_cap        DECIMAL(10,2) NOT NULL DEFAULT 3.00,
      status          ENUM('waiting','active','closed') NOT NULL DEFAULT 'waiting',
      created_at      DATETIME      NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await conn.query(`CREATE TABLE IF NOT EXISTS tournaments (
      id                   CHAR(36)      NOT NULL DEFAULT (UUID()),
      name                 VARCHAR(128)  NOT NULL,
      game_type            ENUM('holdem','omaha','five_card_draw','seven_card_stud') NOT NULL DEFAULT 'holdem',
      chip_mode            ENUM('play','real') NOT NULL DEFAULT 'play',
      tournament_type      ENUM('sit_and_go','scheduled') NOT NULL,
      max_players          SMALLINT      NOT NULL DEFAULT 9,
      min_players          SMALLINT      NOT NULL DEFAULT 2,
      buy_in               DECIMAL(10,2) NOT NULL DEFAULT 10,
      rake                 DECIMAL(10,2) NOT NULL DEFAULT 1,
      prize_pool           DECIMAL(10,2) NOT NULL DEFAULT 0,
      payout_json          JSON          NOT NULL,
      blind_schedule_json  JSON          NOT NULL,
      status               ENUM('registering','running','finished','cancelled') NOT NULL DEFAULT 'registering',
      starts_at            DATETIME      NULL,
      started_at           DATETIME      NULL,
      ended_at             DATETIME      NULL,
      created_by           CHAR(36)      NOT NULL,
      created_at           DATETIME      NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id),
      FOREIGN KEY (created_by) REFERENCES players(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await conn.query(`CREATE TABLE IF NOT EXISTS tournament_registrations (
      tournament_id   CHAR(36)      NOT NULL,
      player_id       CHAR(36)      NOT NULL,
      registered_at   DATETIME      NOT NULL DEFAULT NOW(),
      final_position  SMALLINT      NULL,
      prize_won       DECIMAL(10,2) NULL,
      PRIMARY KEY (tournament_id, player_id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await conn.query(`CREATE TABLE IF NOT EXISTS hand_history (
      id              BIGINT        NOT NULL AUTO_INCREMENT,
      table_id        CHAR(36)      NOT NULL,
      tournament_id   CHAR(36)      NULL,
      hand_number     INT           NOT NULL,
      game_type       ENUM('holdem','omaha','five_card_draw','seven_card_stud') NOT NULL,
      chip_mode       ENUM('play','real') NOT NULL,
      players_json    JSON          NOT NULL,
      community_json  JSON          NOT NULL,
      actions_json    JSON          NOT NULL,
      pot_total       DECIMAL(10,2) NOT NULL,
      winners_json    JSON          NOT NULL,
      started_at      DATETIME      NOT NULL,
      ended_at        DATETIME      NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_table (table_id),
      INDEX idx_tournament (tournament_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await conn.query(`CREATE TABLE IF NOT EXISTS chip_transactions (
      id              BIGINT        NOT NULL AUTO_INCREMENT,
      player_id       CHAR(36)      NOT NULL,
      chip_mode       ENUM('play','real') NOT NULL,
      delta           DECIMAL(10,2) NOT NULL,
      reason          ENUM('buy_in','win','tournament_buyin','tournament_prize','deposit','withdrawal','refill','rake') NOT NULL,
      reference_id    CHAR(36)      NULL,
      payment_gateway ENUM('culqi','stripe') NULL,
      gateway_tx_id   VARCHAR(128)  NULL,
      created_at      DATETIME      NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      INDEX idx_player (player_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Migration: share token for public hand replays
    try {
      await conn.query(`ALTER TABLE hand_history ADD COLUMN share_token VARCHAR(40) NULL, ADD INDEX idx_share (share_token)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Migration: bot flag on players (nivel real vive aparte, nunca se expone)
    try {
      await conn.query(`ALTER TABLE players ADD COLUMN is_bot TINYINT(1) NOT NULL DEFAULT 0`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Migration: snapshot del runtime del torneo (persistencia ante reinicios)
    try {
      await conn.query(`ALTER TABLE tournaments ADD COLUMN runtime_json LONGTEXT NULL`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Migration: mesas privadas con código de invitación (home games)
    try {
      await conn.query(`ALTER TABLE tables_cash ADD COLUMN invite_code VARCHAR(12) NULL, ADD COLUMN owner_id CHAR(36) NULL, ADD INDEX idx_invite (invite_code)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Migration: recompensa por eliminación (torneos bounty/KO)
    try {
      await conn.query(`ALTER TABLE tournaments ADD COLUMN bounty DECIMAL(10,2) NOT NULL DEFAULT 0`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // ── MODO CLUBES (estilo PPPoker) ──
    await conn.query(`CREATE TABLE IF NOT EXISTS clubs (
      id         CHAR(36)      NOT NULL,
      club_code  VARCHAR(8)    NOT NULL UNIQUE,
      name       VARCHAR(40)   NOT NULL,
      emblem     VARCHAR(8)    NOT NULL DEFAULT '♣',
      owner_id   CHAR(36)      NOT NULL,
      treasury   DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_owner (owner_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await conn.query(`CREATE TABLE IF NOT EXISTS club_members (
      club_id   CHAR(36) NOT NULL,
      player_id CHAR(36) NOT NULL,
      role      ENUM('owner','member') NOT NULL DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (club_id, player_id),
      INDEX idx_player (player_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Modo de ingreso al club: directo (open) o con aprobación del dueño
    try {
      await conn.query(`ALTER TABLE clubs ADD COLUMN join_mode ENUM('open','approval') NOT NULL DEFAULT 'open'`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Solicitudes pendientes conviven con los miembros (status)
    try {
      await conn.query(`ALTER TABLE club_members ADD COLUMN status ENUM('pending','active') NOT NULL DEFAULT 'active'`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // ── UNIONES (Fase 5D): clubes aliados comparten el lobby de partidas ──
    await conn.query(`CREATE TABLE IF NOT EXISTS unions (
      id            CHAR(36)    NOT NULL,
      union_code    VARCHAR(8)  NOT NULL UNIQUE,
      name          VARCHAR(40) NOT NULL,
      owner_club_id CHAR(36)    NOT NULL,
      created_at    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Un club pertenece a lo sumo a una unión
    try {
      await conn.query(`ALTER TABLE clubs ADD COLUMN union_id CHAR(36) NULL, ADD INDEX idx_union (union_id)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Mesas de club: comisión (rake) configurable por el dueño
    try {
      await conn.query(`ALTER TABLE tables_cash ADD COLUMN club_id CHAR(36) NULL, ADD COLUMN rake_pct DECIMAL(4,2) NOT NULL DEFAULT 0, ADD COLUMN rake_cap_bb INT NOT NULL DEFAULT 0, ADD INDEX idx_club (club_id)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Snapshot de los stacks de las mesas cash (el estado vive en RAM). Permite
    // reembolsar las fichas en juego si el proceso reinicia, en vez de perderlas.
    try {
      await conn.query(`ALTER TABLE tables_cash ADD COLUMN runtime_json LONGTEXT NULL`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Torneos de club: comisión de inscripción (buy-in + fee)
    try {
      await conn.query(`ALTER TABLE tournaments ADD COLUMN club_id CHAR(36) NULL, ADD COLUMN fee DECIMAL(10,2) NOT NULL DEFAULT 0, ADD INDEX idx_t_club (club_id)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Bots: el nivel real y la personalidad viven aislados de players
    await conn.query(`CREATE TABLE IF NOT EXISTS bots (
      bot_id           CHAR(36)     NOT NULL,
      level            TINYINT      NOT NULL,
      personality_json JSON,
      created_at       DATETIME     NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id),
      FOREIGN KEY (bot_id) REFERENCES players(id),
      INDEX idx_level (level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Debido proceso: motivo de baneo, apelación y última interacción humana.
    for (const col of [
      "ADD COLUMN ban_reason VARCHAR(200) NULL",
      "ADD COLUMN appeal_text VARCHAR(500) NULL",
      "ADD COLUMN appealed_at DATETIME NULL",
      "ADD COLUMN last_interaction DATETIME NULL",
    ]) {
      try { await conn.query(`ALTER TABLE players ${col}`); }
      catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    }

    // Bitácora de moderación: TODA acción (banear/desbanear/marcar) queda
    // trazada — quién, cuándo, por qué, con qué score. Sostiene la sanción y
    // la apelación (nada de sanciones sin evidencia).
    await conn.query(`CREATE TABLE IF NOT EXISTS moderation_actions (
      id          BIGINT       NOT NULL AUTO_INCREMENT,
      player_id   CHAR(36)     NOT NULL,
      action      ENUM('ban','unban','flag','note') NOT NULL,
      reason      VARCHAR(300) NULL,
      score_at    SMALLINT     NULL,
      by_admin    CHAR(36)     NULL,
      at          DATETIME     NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      INDEX idx_player (player_id),
      INDEX idx_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Vigilancia anti-trampas: cada conexión de un humano deja rastro de
    // IP y dispositivo. Con esto se detecta multicuenta (misma IP/dispositivo,
    // varias cuentas) y colusión (dos cuentas de la misma casa en una mesa).
    await conn.query(`CREATE TABLE IF NOT EXISTS login_events (
      id          BIGINT       NOT NULL AUTO_INCREMENT,
      player_id   CHAR(36)     NOT NULL,
      ip          VARCHAR(45)  NOT NULL,
      user_agent  VARCHAR(255) NULL,
      fingerprint VARCHAR(64)  NULL,
      at          DATETIME     NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      INDEX idx_player (player_id),
      INDEX idx_ip (ip),
      INDEX idx_fp (fingerprint)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Migración para bases ya existentes con login_events sin fingerprint
    try {
      await conn.query(`ALTER TABLE login_events ADD COLUMN fingerprint VARCHAR(64) NULL, ADD INDEX idx_fp (fingerprint)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Etiquetas de los testers: qué nivel le adivinan a cada jugador/bot
    await conn.query(`CREATE TABLE IF NOT EXISTS tester_labels (
      tester_id       CHAR(36)     NOT NULL,
      target_id       CHAR(36)     NOT NULL,
      estimated_level TINYINT      NULL,
      tag             VARCHAR(16)  NULL,
      note            VARCHAR(200) NULL,
      updated_at      DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      PRIMARY KEY (tester_id, target_id),
      INDEX idx_target (target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ── Fase 3: seguridad de cuenta ──
    // token_version: invalidar todos los JWT de un usuario (ban / cambio de
    // contraseña) sin esperar a que expiren. excluded_until: auto-exclusión
    // (responsible gaming) — no puede entrar mientras esté vigente.
    try {
      await conn.query(`ALTER TABLE players ADD COLUMN token_version INT NOT NULL DEFAULT 0, ADD COLUMN excluded_until DATETIME NULL`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    await conn.query(`CREATE TABLE IF NOT EXISTS password_resets (
      token      CHAR(64) NOT NULL,
      player_id  CHAR(36) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at    DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT NOW(),
      PRIMARY KEY (token),
      INDEX idx_player (player_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ── Tabla puente hand_players: pertenencia (y neto) por mano. Permite
    // consultar el historial/stats de un jugador con un JOIN indexado en vez de
    // un JSON_SEARCH sobre players_json (full-scan que no escala con las manos).
    await conn.query(`CREATE TABLE IF NOT EXISTS hand_players (
      hand_id   BIGINT   NOT NULL,
      player_id CHAR(36) NOT NULL,
      net       INT      NOT NULL DEFAULT 0,
      PRIMARY KEY (hand_id, player_id),
      INDEX idx_player (player_id),
      FOREIGN KEY (hand_id)   REFERENCES hand_history(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id)      ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Backfill único desde players_json (histórico). net=0 en las manos viejas;
    // las nuevas guardan el neto real. Solo corre si la tabla está vacía.
    const [[hp]] = await conn.query('SELECT COUNT(*) n FROM hand_players');
    if (hp.n === 0) {
      const [[hh]] = await conn.query('SELECT COUNT(*) n FROM hand_history');
      if (hh.n > 0) {
        console.log(`[DB] Backfill hand_players desde ${hh.n} manos…`);
        let last = 0, done = 0;
        for (;;) {
          const [rows] = await conn.query(
            'SELECT id, players_json FROM hand_history WHERE id > ? ORDER BY id LIMIT 500', [last]
          );
          if (!rows.length) break;
          const values = [];
          for (const r of rows) {
            last = r.id;
            let players = [];
            try { players = typeof r.players_json === 'string' ? JSON.parse(r.players_json) : (r.players_json || []); } catch {}
            const seen = new Set();
            for (const p of players) {
              if (p && p.playerId && !seen.has(p.playerId)) { seen.add(p.playerId); values.push([r.id, p.playerId, 0]); }
            }
          }
          // INSERT IGNORE: salta filas con FK inválida (jugadores ya borrados)
          if (values.length) await conn.query('INSERT IGNORE INTO hand_players (hand_id, player_id, net) VALUES ?', [values]);
          done += rows.length;
        }
        console.log(`[DB] Backfill hand_players completo (${done} manos).`);
      }
    }

    console.log('[DB] Schema created/verified');
  } finally {
    conn.release();
  }
}

module.exports = setupDb;
