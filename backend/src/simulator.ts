
import "dotenv/config";
import mqtt from "mqtt";

const MQTT_URL = process.env.MQTT_URL || "mqtt://127.0.0.1:1883";
const TOPIC = "invernadero/01/mediciones";

const client = mqtt.connect(MQTT_URL);

function aleatorio(min: number, max: number): number {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function enviarMedicion() {
  const medicion = {
    dispositivo: "ESP32-SIMULADO",
    temperatura: aleatorio(20, 35),
    humedad_ambiental: aleatorio(40, 85),
    humedad_suelo: aleatorio(20, 75)
  };

  client.publish(TOPIC, JSON.stringify(medicion), (error) => {
    if (error) {
      console.error("Error al publicar:", error.message);
      return;
    }

    console.log("Medición simulada enviada:", medicion);
  });
}

let intervalo: ReturnType<typeof setInterval> | undefined;

client.on("connect", () => {
  console.log("Simulador conectado a MQTT");

  if (intervalo) clearInterval(intervalo);

  enviarMedicion();
  intervalo = setInterval(enviarMedicion, 5000);
});

client.on("close", () => {
  if (intervalo) {
    clearInterval(intervalo);
    intervalo = undefined;
  }
});

client.on("error", (error) => {
  console.error("Error MQTT:", error.message);
});

process.on("SIGINT", () => {
  if (intervalo) clearInterval(intervalo);

  client.end(false, () => {
    console.log("Simulador detenido");
    process.exit(0);
  });
});
