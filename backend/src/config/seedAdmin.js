require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pokersite',
  });

  const id = uuidv4();
  const hash = await bcrypt.hash('admin123', 10);
  await conn.query(
    `INSERT INTO players (id, email, nickname, password_hash, play_chips, real_chips, is_admin)
     VALUES (?, ?, ?, ?, 10000, 0, 1)
     ON DUPLICATE KEY UPDATE is_admin = 1`,
    [id, 'admin@pokersite.com', 'Admin', hash]
  );

  // Create a default table
  const tableId = uuidv4();
  await conn.query(
    `INSERT INTO tables_cash (id, name, game_type, chip_mode, max_seats, small_blind, big_blind, buy_in_min, buy_in_max)
     VALUES (?, 'Mesa Principal', 'holdem', 'play', 6, 5, 10, 100, 1000)`,
    [tableId]
  );

  console.log('Admin creado: admin@pokersite.com / admin123');
  console.log('Mesa creada: Mesa Principal (6 jugadores, 5/10 blinds)');
  await conn.end();
}

seed().catch(console.error);
