
import "dotenv/config";
import { Pool } from "pg";

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5433),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

export async function verificarConexionBD() {
  try {
    const resultado = await pool.query("SELECT NOW()");

    console.log("PostgreSQL conectado correctamente");
    console.log("Hora del servidor:", resultado.rows[0].now);
  } catch (error) {
    console.error("Error al conectar PostgreSQL:", error);
  }
}
