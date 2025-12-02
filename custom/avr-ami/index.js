/**
 * index.js
 * VERSION DEBUG TOTALE : Affiche tout pour trouver où se cache l'UUID
 */
const express = require("express");
const Ami = require("asterisk-manager");
const { extractUUID, findCallByUUID } = require("./utils");

require("dotenv").config();

const app = express();
app.use(express.json());

let calls = {};

const ami = new Ami(
  process.env.AMI_PORT || "5038",
  process.env.AMI_HOST || "avr-asterisk",
  process.env.AMI_USERNAME || "avr",
  process.env.AMI_PASSWORD || "avr",
  true
);

ami.keepConnected();

ami.on('connect', () => console.log('✅ CONNECTED to Asterisk AMI'));
ami.on('error', (err) => console.error('❌ AMI Connection Error:', err.message));

// -----------------------------------------------------------------------------
// GESTION DES ÉVÉNEMENTS (MODE ESPION)
// -----------------------------------------------------------------------------

// On écoute TOUS les événements UserEvent sans filtre au début
ami.on("userevent", (event) => {
  // AFFICHE L'EVENEMENT BRUT DANS LES LOGS
  console.log("🔍 RAW EVENT RECEIVED:", JSON.stringify(event));

  // Détection souple (Case Insensitive)
  const eventName = event.userevent ? event.userevent.toLowerCase() : "";
  
  if (eventName === "avrstart") {
      const linkedId = event.linkedid || event.uniqueid;
      
      // On cherche l'UUID partout où il pourrait être
      // Asterisk met parfois les variables dans des headers différents
      let uuid = event.uuid || event.UUID || event.Uuid;
      
      // Si l'UUID n'est pas dans une propriété directe, il est peut-être dans le "Content" ou "Header"
      if (!uuid && event.content) {
         // Parfois reçu comme "UUID: xxxx-xxxx..."
         const match = event.content.match(/UUID:\s*([a-f0-9-]+)/i);
         if (match) uuid = match[1];
      }

      const channel = event.channel;

      if (uuid && channel) {
          console.log(`📞 CALL REGISTERED! UUID: ${uuid} | Channel: ${channel}`);
          calls[linkedId] = {
              uuid: uuid.trim(),
              channel: channel
          };
      } else {
          console.warn("⚠️ AVRStart received but UUID or Channel missing:", event);
      }
  }
});

// Nettoyage
ami.on("hangup", (event) => {
  if (calls[event.linkedid]) delete calls[event.linkedid];
});

// -----------------------------------------------------------------------------
// API
// -----------------------------------------------------------------------------

const handleHangup = async (req, res) => {
  const { uuid } = req.body;

  try {
    console.log(`[API] Request to hangup UUID: ${uuid}`);
    
    // DEBUG: Afficher la mémoire si vide
    if (Object.keys(calls).length === 0) {
        console.log("⚠️ MEMORY IS EMPTY. No calls registered.");
    } else {
        console.log("🧠 Memory contains:", Object.keys(calls).map(k => calls[k].uuid));
    }

    const call = findCallByUUID(calls, uuid);
    
    if (call) {
      console.log(`[API] ✅ Call found. Channel: ${call.channel}. KILLING IT.`);
      
      // COMMANDE CLI (La plus efficace)
      ami.action({
        action: "Command",
        command: `soft hangup ${call.channel}`
      });
      
      // Sécurité supplémentaire
      ami.action({
        action: "Command",
        command: `channel request hangup ${call.channel}`
      });

      res.status(200).json({ message: "Kill sent" });
    } else {
      console.warn(`[API] ❌ Call NOT FOUND.`);
      res.status(404).json({ message: `Call not found` });
    }
  } catch (error) {
    console.log("Error:", error.message);
    res.status(500).json({ message: "Error" });
  }
};

app.post("/hangup", handleHangup);
// Routes fantômes pour éviter les 404
app.post("/variables", (req, res) => res.json({}));
app.post("/transfer", (req, res) => res.json({}));

const port = process.env.PORT || 6006;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});