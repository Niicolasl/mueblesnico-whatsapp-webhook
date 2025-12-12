import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function initDatabase() {
  const query = `
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_code VARCHAR(20) UNIQUE NOT NULL, -- MN-2025-0001
      nombre_cliente VARCHAR(255) NOT NULL,
      numero_whatsapp VARCHAR(20) NOT NULL,
      descripcion_trabajo TEXT NOT NULL,
      fecha_creacion DATE NOT NULL,

      -- Esta se rellenará SOLO cuando exista anticipo
      fecha_aprox_entrega DATE,

      valor_total NUMERIC NOT NULL,
      valor_abonado NUMERIC DEFAULT 0,
      saldo_pendiente NUMERIC DEFAULT 0,

      estado_pedido VARCHAR(50) NOT NULL DEFAULT 'pendiente de anticipo',

      cancelado BOOLEAN DEFAULT false,
      fecha_cancelacion DATE
    );

    -- Secuencia anual para códigos MN-AAAA-XXXX
    CREATE TABLE IF NOT EXISTS order_sequence (
      year INT PRIMARY KEY,
      last_number INT NOT NULL
    );

    -- Tabla de clientes
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) UNIQUE,
      name VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Historial de mensajes
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      client_id INTEGER REFERENCES clients(id),
      direction VARCHAR(20),
      message TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabla de "jobs" (puede servir como historial extra si quieres usarla)
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      client_id INTEGER REFERENCES clients(id),
      title VARCHAR(255),
      description TEXT,
      price NUMERIC,
      status VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(query);
    console.log("📦 Tablas creadas o ya existen.");
  } catch (error) {
    console.error("❌ Error creando tablas:", error);
  }
}
