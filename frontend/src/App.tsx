
import { useEffect, useState } from "react";
import {
  Thermometer,
  Droplets,
  Sprout,
  Wifi,
  WifiOff,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu
} from "lucide-react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

import "./App.css";

// =====================================
// 1. TIPOS DE DATOS
// =====================================

interface Medicion {
  id: string;
  dispositivo: string;
  temperatura: number;
  humedad_ambiental: number;
  humedad_suelo: number;
  fecha_registro: string;
}

const API = "http://localhost:3000/api";
const WS_URL = "ws://localhost:3000/ws";

// Límites temporales para demostración.
// Más adelante podrán configurarse según el cultivo.
const TEMP_MAX = 30;
const HUMEDAD_SUELO_MIN = 30;
const HUMEDAD_AMBIENTAL_MAX = 80;

// Si no llegan mediciones durante 20 segundos,
// consideramos que los datos están desactualizados.
const TIEMPO_SIN_DATOS = 20000;

// =====================================
// 2. FUNCIONES AUXILIARES
// =====================================

function normalizarMedicion(m: Medicion): Medicion {
  return {
    ...m,
    id: String(m.id),
    temperatura: Number(m.temperatura),
    humedad_ambiental: Number(m.humedad_ambiental),
    humedad_suelo: Number(m.humedad_suelo)
  };
}

// Combina registros sin repetir IDs.
function combinarMediciones(
  anteriores: Medicion[],
  nuevas: Medicion[]
): Medicion[] {
  const mapa = new Map<string, Medicion>();

  for (const medicion of [...anteriores, ...nuevas]) {
    mapa.set(medicion.id, medicion);
  }

  return Array.from(mapa.values())
    .sort((a, b) => {
      const diferencia =
        new Date(b.fecha_registro).getTime() -
        new Date(a.fecha_registro).getTime();

      if (diferencia !== 0) return diferencia;

      return b.id.localeCompare(a.id, undefined, {
        numeric: true
      });
    })
    .slice(0, 100);
}

function formatearHora(fecha: string): string {
  return new Date(fecha).toLocaleTimeString("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleString("es-BO");
}

// =====================================
// 3. COMPONENTE PRINCIPAL
// =====================================

export default function App() {
  const [mediciones, setMediciones] = useState<Medicion[]>([]);
  const [conectado, setConectado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [ahora, setAhora] = useState(Date.now());

  // =====================================
  // 4. RELOJ PARA DETECTAR DATOS ANTIGUOS
  // =====================================

  useEffect(() => {
    const intervalo = setInterval(() => {
      setAhora(Date.now());
    }, 1000);

    return () => clearInterval(intervalo);
  }, []);

  // =====================================
  // 5. CARGAR DATOS Y CONECTAR WEBSOCKET
  // =====================================

  useEffect(() => {
    let activo = true;
    let socket: WebSocket | null = null;

    let reconexion:
      | ReturnType<typeof setTimeout>
      | undefined;

    async function cargarHistorial() {
      try {
        const respuesta = await fetch(
          `${API}/mediciones`
        );

        if (!respuesta.ok) {
          throw new Error(
            "No se pudieron consultar las mediciones"
          );
        }

        const datos: unknown = await respuesta.json();

        if (!Array.isArray(datos)) {
          throw new Error("Formato de datos incorrecto");
        }

        const registros = (datos as Medicion[]).map(
          normalizarMedicion
        );

        if (activo) {
          setMediciones((anteriores) =>
            combinarMediciones(anteriores, registros)
          );
        }
      } catch (error) {
        console.error(
          "Error cargando historial:",
          error
        );
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    function conectarWebSocket() {
      if (!activo) return;

      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        if (!activo) return;

        console.log("WebSocket conectado");
        setConectado(true);

        // Recuperar datos que pudieron llegar
        // durante una desconexión.
        void cargarHistorial();
      };

      socket.onmessage = (evento) => {
        try {
          const mensaje = JSON.parse(evento.data);

          if (mensaje.tipo !== "medicion") {
            return;
          }

          const nuevaMedicion = normalizarMedicion(
            mensaje.datos as Medicion
          );

          if (activo) {
            setMediciones((anteriores) =>
              combinarMediciones(
                anteriores,
                [nuevaMedicion]
              )
            );
          }
        } catch (error) {
          console.error(
            "Error procesando mensaje WebSocket:",
            error
          );
        }
      };

      socket.onclose = () => {
        if (!activo) return;

        console.log("WebSocket desconectado");
        setConectado(false);

        // Reintentar conexión después de 3 segundos.
        reconexion = setTimeout(() => {
          conectarWebSocket();
        }, 3000);
      };

      socket.onerror = () => {
        console.error("Error de WebSocket");
        socket?.close();
      };
    }

    void cargarHistorial();
    conectarWebSocket();

    return () => {
      activo = false;

      if (reconexion) {
        clearTimeout(reconexion);
      }

      socket?.close();
    };
  }, []);

  // =====================================
  // 6. ÚLTIMA MEDICIÓN E HISTORIAL
  // =====================================

  const ultima = mediciones[0];

  // Solo las 30 mediciones más recientes
  // para evitar saturar la gráfica.
  const historial = [...mediciones]
    .slice(0, 30)
    .reverse();

  // =====================================
  // 7. ESTADO DEL DISPOSITIVO
  // =====================================

  const fechaUltima = ultima
    ? new Date(ultima.fecha_registro).getTime()
    : 0;

  const dispositivoReciente =
    fechaUltima > 0 &&
    Number.isFinite(fechaUltima) &&
    ahora - fechaUltima >= 0 &&
    ahora - fechaUltima < TIEMPO_SIN_DATOS;

  const esSimulado =
    ultima?.dispositivo === "ESP32-SIMULADO";

  const segundosSinDatos = fechaUltima > 0
    ? Math.max(
        0,
        Math.floor((ahora - fechaUltima) / 1000)
      )
    : null;

  // =====================================
  // 8. SISTEMA DE ALERTAS
  // =====================================

  const alertas: string[] = [];

  if (ultima && dispositivoReciente) {
    if (ultima.temperatura > TEMP_MAX) {
      alertas.push(
        `Temperatura elevada: ${ultima.temperatura.toFixed(1)} °C. Límite: ${TEMP_MAX} °C.`
      );
    }

    if (ultima.humedad_suelo < HUMEDAD_SUELO_MIN) {
      alertas.push(
        `Humedad del suelo baja: ${ultima.humedad_suelo.toFixed(1)} %. Límite mínimo: ${HUMEDAD_SUELO_MIN} %.`
      );
    }

    if (
      ultima.humedad_ambiental >
      HUMEDAD_AMBIENTAL_MAX
    ) {
      alertas.push(
        `Humedad ambiental elevada: ${ultima.humedad_ambiental.toFixed(1)} %. Límite: ${HUMEDAD_AMBIENTAL_MAX} %.`
      );
    }
  }

  // =====================================
  // 9. INTERFAZ DEL DASHBOARD
  // =====================================

  return (
    <div className="app">

      {/* ENCABEZADO */}

      <header className="header">
        <div>
          <h1>🌱 AgroMonitor IoT</h1>
          <p>
            Sistema de monitoreo del invernadero
          </p>
        </div>

        <div
          className={
            conectado
              ? "estado conectado"
              : "estado desconectado"
          }
        >
          {conectado ? (
            <Wifi size={18} />
          ) : (
            <WifiOff size={18} />
          )}

          {conectado
            ? "Tiempo real conectado"
            : "Tiempo real desconectado"}
        </div>
      </header>

      <main className="contenido">

        {/* TÍTULO */}

        <section className="seccion-intro">
          <h2>Panel de monitoreo</h2>

          <p>
            Actualización en tiempo real mediante WebSocket
          </p>
        </section>

        {/* TARJETAS DE MEDICIONES */}

        <section className="tarjetas">

          <div className="tarjeta">
            <Thermometer
              className="icono temperatura"
            />

            <h3>Temperatura</h3>

            <strong>
              {ultima
                ? ultima.temperatura.toFixed(1)
                : "--"} °C
            </strong>

            <p>Temperatura ambiental</p>
          </div>

          <div className="tarjeta">
            <Droplets
              className="icono humedad"
            />

            <h3>Humedad ambiental</h3>

            <strong>
              {ultima
                ? ultima.humedad_ambiental.toFixed(1)
                : "--"} %
            </strong>

            <p>Humedad relativa del aire</p>
          </div>

          <div className="tarjeta">
            <Sprout
              className="icono suelo"
            />

            <h3>Humedad del suelo</h3>

            <strong>
              {ultima
                ? ultima.humedad_suelo.toFixed(1)
                : "--"} %
            </strong>

            <p>Humedad estimada del suelo</p>
          </div>

        </section>

        {/* ESTADO DEL DISPOSITIVO */}

        <section className="panel estado-dispositivo">
          <div className="titulo-panel">
            <Cpu size={24} />
            <h2>Estado del dispositivo</h2>
          </div>

          <div className="informacion-dispositivo">

            <div className="dato-dispositivo">
              <span>Dispositivo</span>
              <strong>
                {ultima?.dispositivo ??
                  "Sin mediciones"}
              </strong>
            </div>

            <div className="dato-dispositivo">
              <span>Origen de los datos</span>

              <strong>
                {!ultima
                  ? "Sin identificar"
                  : esSimulado
                  ? "Simulador"
                  : "No identificado como simulador"}
              </strong>
            </div>

            <div className="dato-dispositivo">
              <span>Estado de las mediciones</span>

              <strong
                className={
                  dispositivoReciente
                    ? "texto-verde"
                    : "texto-rojo"
                }
              >
                {dispositivoReciente
                  ? "Recibiendo mediciones"
                  : "Sin mediciones recientes"}
              </strong>
            </div>

            <div className="dato-dispositivo">
              <span>Última medición</span>

              <strong>
                {ultima
                  ? formatearFecha(
                      ultima.fecha_registro
                    )
                  : "Sin datos"}
              </strong>
            </div>

            <div className="dato-dispositivo">
              <span>Tiempo desde la última lectura</span>

              <strong>
                {segundosSinDatos !== null
                  ? `${segundosSinDatos} segundos`
                  : "Sin datos"}
              </strong>
            </div>

          </div>
        </section>

        {/* SISTEMA DE ALERTAS */}

        <section className="panel">
          <div className="titulo-panel">
            <AlertTriangle size={24} />
            <h2>Alertas del invernadero</h2>
          </div>

          {!dispositivoReciente ? (

            <div className="alerta alerta-advertencia">
              <Clock size={20} />

              <span>
                No se reciben mediciones recientes.
                Verifica el simulador, el dispositivo
                o la comunicación MQTT.
              </span>
            </div>

          ) : alertas.length === 0 ? (

            <div className="alerta alerta-normal">
              <CheckCircle size={20} />

              <span>
                Las mediciones se encuentran dentro
                de los límites establecidos para
                la demostración.
              </span>
            </div>

          ) : (

            alertas.map((mensaje) => (
              <div
                key={mensaje}
                className="alerta alerta-peligro"
              >
                <AlertTriangle size={20} />
                <span>{mensaje}</span>
              </div>
            ))

          )}
        </section>

        {/* GRÁFICA */}

        <section className="panel">
          <div className="titulo-panel">
            <Activity size={24} />

            <h2>Historial de mediciones</h2>
          </div>

          <p className="subtitulo-panel">
            Mostrando las últimas 30 mediciones
          </p>

          {historial.length > 0 ? (
            <div className="grafica">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <LineChart data={historial}>

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="fecha_registro"
                    tickFormatter={formatearHora}
                    minTickGap={25}
                  />

                  <YAxis />

                  <Tooltip
                    labelFormatter={(valor) =>
                      formatearFecha(String(valor))
                    }
                  />

                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="temperatura"
                    name="Temperatura"
                    stroke="#f97316"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />

                  <Line
                    type="monotone"
                    dataKey="humedad_ambiental"
                    name="H. ambiental"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />

                  <Line
                    type="monotone"
                    dataKey="humedad_suelo"
                    name="H. suelo"
                    stroke="#16a34a"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />

                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="sin-datos">
              {cargando
                ? "Cargando mediciones..."
                : "No existen mediciones registradas."}
            </p>
          )}
        </section>

        {/* TABLA DE MEDICIONES */}

        <section className="panel">
          <div className="titulo-panel">
            <Clock size={24} />
            <h2>Últimas mediciones</h2>
          </div>

          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Temperatura</th>
                  <th>H. ambiental</th>
                  <th>H. suelo</th>
                </tr>
              </thead>

              <tbody>
                {mediciones.slice(0, 10).map(
                  (m) => (
                    <tr key={m.id}>
                      <td>
                        {formatearFecha(
                          m.fecha_registro
                        )}
                      </td>

                      <td>
                        {m.temperatura.toFixed(1)} °C
                      </td>

                      <td>
                        {m.humedad_ambiental.toFixed(1)} %
                      </td>

                      <td>
                        {m.humedad_suelo.toFixed(1)} %
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {mediciones.length === 0 && (
            <p className="sin-datos">
              No hay registros disponibles.
            </p>
          )}
        </section>

      </main>

      <footer className="footer">
        AgroMonitor IoT | Sistema de monitoreo
        de invernadero
      </footer>

    </div>
  );
}
