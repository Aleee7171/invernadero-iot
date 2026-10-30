
import "dotenv/config";
import express from "express";
import cors from "cors";
import mqtt from "mqtt";
import { pool, verificarConexionBD } from "./config/database";
import { createServer } from "http";
import WebSocket, { WebSocketServer } from "ws";

const app = express();
const httpServer = createServer(app);

const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws"
});

wss.on("connection", (ws) => {
  console.log("Dashboard conectado mediante WebSocket");

  ws.send(JSON.stringify({
    tipo: "conexion",
    mensaje: "Conectado a AgroMonitor IoT"
  }));

  ws.on("close", () => {
    console.log("Dashboard desconectado de WebSocket");
  });
});
const PORT = Number(process.env.PORT || 3000);
const MQTT_URL = process.env.MQTT_URL || "mqtt://127.0.0.1:1883";
const TOPIC = "invernadero/01/mediciones";

app.use(cors());
app.use(express.json());

// 1. Conexión con MQTT
const mqttClient = mqtt.connect(MQTT_URL);

mqttClient.on("connect", () => {
  console.log("Conectado al broker MQTT");

  mqttClient.subscribe(TOPIC, (error) => {
    if (error) {
      console.error("Error al suscribirse:", error);
    } else {
      console.log("Esperando mediciones del ESP32...");
    }
  });
});

// 2. Recibir y guardar las mediciones
mqttClient.on("message", (topic, message) => {
  if (topic !== TOPIC) return;

  void guardarMedicion(message.toString());
});

async function guardarMedicion(mensaje: string) {
  try {
    const datos: unknown = JSON.parse(mensaje);

    if (
      typeof datos !== "object" ||
      datos === null ||
      Array.isArray(datos)
    ) {
      throw new Error("Formato de mensaje incorrecto");
    }

    const medicion = datos as Record<string, unknown>;

    const { dispositivo, temperatura, humedad_ambiental, humedad_suelo } =
      medicion;

    const numeroValido = (valor: unknown) =>
      typeof valor === "number" && Number.isFinite(valor);

    if (
      typeof dispositivo !== "string" ||
      dispositivo.length === 0 ||
      dispositivo.length > 50 ||
      !numeroValido(temperatura) ||
      !numeroValido(humedad_ambiental) ||
      !numeroValido(humedad_suelo)
    ) {
      throw new Error("Medición con campos inválidos");
    }

    const temp = temperatura as number;
    const humedadAire = humedad_ambiental as number;
    const humedadTierra = humedad_suelo as number;

    if (
      temp < -40 || temp > 80 ||
      humedadAire < 0 || humedadAire > 100 ||
      humedadTierra < 0 || humedadTierra > 100
    ) {
      throw new Error("Valores fuera de los rangos admitidos");
    }

    const resultado = await pool.query(
      `INSERT INTO mediciones
       (dispositivo, temperatura, humedad_ambiental, humedad_suelo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [dispositivo, temp, humedadAire, humedadTierra]
    );

    console.log("Medición guardada:", resultado.rows[0]);
    const evento = JSON.stringify({
  tipo: "medicion",
  datos: resultado.rows[0]
});

wss.clients.forEach((cliente) => {
  if (cliente.readyState === WebSocket.OPEN) {
    cliente.send(evento);
  }
});

console.log("Medición enviada por WebSocket");
  } catch (error) {
    console.error("No se pudo guardar la medición:", error);
  }
}

// 3. Comprobar el servidor
app.get("/api/health", (_req, res) => {
  res.json({
    estado: "activo",
    servicio: "Backend Invernadero IoT"
  });
});

// 4. Consultar el historial de mediciones
app.get("/api/mediciones", async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT * FROM mediciones
       ORDER BY fecha_registro DESC, id DESC
       LIMIT 100`
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "No se pudieron consultar las mediciones"
    });
  }
});

// 5. Consultar la última medición
app.get("/api/mediciones/ultima", async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT * FROM mediciones
       ORDER BY fecha_registro DESC, id DESC
       LIMIT 1`
    );

    if (resultado.rows.length === 0) {
      res.status(404).json({
        mensaje: "Todavía no existen mediciones"
      });
      return;
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "No se pudo consultar la última medición"
    });
  }
});

mqttClient.on("error", (error) => {
  console.error("Error MQTT:", error.message);
});

// 6. Iniciar backend
httpServer.listen(PORT, () => {
  console.log(`Servidor HTTP y WebSocket en http://localhost:${PORT}`);
});

void verificarConexionBD();

