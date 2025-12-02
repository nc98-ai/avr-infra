require("dotenv").config();
const axios = require("axios");

module.exports = {
  name: "avr_hangup",
  description:
    "Ends the conversation once the maintenance is booked or if no availability is found. Always speak a polite goodbye sentence BEFORE calling this function.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async (uuid, {}) => {
    console.log("Hangup requested via Tool.");
    const url = process.env.AMI_URL || "http://127.0.0.1:6006";
    
    // --- AJOUT DE LA TEMPORISATION ICI ---
    // On attend 3 secondes (3000ms) pour laisser l'audio "Au revoir" finir de jouer
    // sur le téléphone du client avant de couper brutalement.
    console.log("Waiting for audio to finish before hanging up...");
    await new Promise(resolve => setTimeout(resolve, 3000)); 
    // -------------------------------------

    try {
      console.log("Executing hangup call now.");
      const res = await axios.post(`${url}/hangup`, { uuid });
      console.log("Hangup response:", res.data);
      return res.data.message;
    } catch (error) {
      console.error("Error during hangup:", error.message);
      return `Error during hangup: ${error.message}`;
    }
  },
};