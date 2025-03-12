const express = require("express");
const mqtt = require("mqtt");
const cors = require("cors");
const path = require("path");

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Koneksi ke EMQX
const mqttClient = mqtt.connect("mqtt://broker.emqx.io");

let sensorData = { 
    suhu: 0, 
    api: 0, 
    gas: 0, 
    ac_power: "off", 
    ac_temp: 25 
};

let lastIRCommandStatus = {
    timestamp: null,
    command: null,
    success: false
};

mqttClient.on("connect", () => {
    console.log("=================================");
    console.log("Connected to EMQX Broker");
    console.log("Server ready to control AC via IR");
    console.log("=================================");
    
    mqttClient.subscribe("esp/sensor");
    mqttClient.subscribe("esp/ac/status"); // Subscribe to AC status updates
});

mqttClient.on("message", (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        
        if (topic === "esp/sensor") {
            sensorData = { ...sensorData, ...data };
            console.log("Sensor data received:", sensorData);
        } 
        else if (topic === "esp/ac/status") {
            // Update status when AC reports back
            sensorData.ac_power = data.power;
            sensorData.ac_temp = data.temp;
            
            lastIRCommandStatus = {
                timestamp: new Date(),
                command: `Power: ${data.power}, Temperature: ${data.temp}°C`,
                success: data.success
            };
            
            console.log("\n========== IR COMMAND STATUS ==========");
            console.log(`Timestamp: ${lastIRCommandStatus.timestamp}`);
            console.log(`Command: ${lastIRCommandStatus.command}`);
            console.log(`Status: ${data.success ? 'SUCCESS' : 'FAILED'}`);
            console.log("=======================================\n");
        }
    } catch (error) {
        console.error(`Error parsing message from topic ${topic}:`, error);
    }
});

// API untuk mendapatkan data sensor
app.get("/api/sensor", (req, res) => {
    res.json(sensorData);
});

// API untuk mendapatkan status IR command terakhir
app.get("/api/ac/status", (req, res) => {
    res.json(lastIRCommandStatus);
});

// API untuk mengontrol AC
app.post("/api/ac", (req, res) => {
    const { power, temp } = req.body;
    
    if (power === undefined) {
        return res.status(400).json({ error: "Parameter 'power' tidak boleh kosong" });
    }

    const command = JSON.stringify({ power, temp: parseInt(temp) || 25 });
    
    console.log("\n========== SENDING IR COMMAND ==========");
    console.log(`Time: ${new Date().toLocaleTimeString()}`);
    console.log(`Command: Power ${power.toUpperCase()}, Temperature: ${temp}°C`);
    console.log("Publishing to topic: esp/ac/control");
    console.log("========================================\n");
    
    // Publish ke topic yang digunakan pada kode ESP8266 (esp/ac/control)
    mqttClient.publish("esp/ac/control", command);
    
    // Update data lokal (akan diperbarui lagi ketika menerima konfirmasi dari ESP8266)
    sensorData.ac_power = power;
    if (temp) sensorData.ac_temp = parseInt(temp);
    
    res.json({ 
        message: `AC ${power === "on" ? "dinyalakan" : "dimatikan"}${temp ? ` dengan suhu ${temp}°C` : ''}`,
        status: sensorData 
    });
});

// Handle 404
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Open http://localhost:${port} in your browser to control the AC`);
});