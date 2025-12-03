/**
 * index.js
 * Entry point for the OpenAI/Azure Speech-to-Speech streaming WebSocket server.
 * This server handles real-time audio streaming between clients and OpenAI's API,
 * performing necessary audio format conversions and WebSocket communication.
 *
 * Client Protocol:
 * - Send {"type": "init", "uuid": "uuid"} to initialize session
 * - Send {"type": "audio", "audio": "base64_encoded_audio"} to stream audio
 * - Receive {"type": "audio", "audio": "base64_encoded_audio"} for responses
 * - Receive {"type": "error", "message": "error_message"} for errors
 *
 * @author Agent Voice Response <info@agentvoiceresponse.com>
 * @see https://www.agentvoiceresponse.com
 */
const WebSocket = require("ws");
const axios = require("axios");
const fs = require("fs").promises;
const { create } = require("@alexanderolsen/libsamplerate-js");
const { loadTools, getToolHandler } = require("./loadTools");

require("dotenv").config();

/**
 * Creates and configures a WebSocket connection to OpenAI's real-time API.
 */
const connectToOpenAI = () => {
  const model = process.env.OPENAI_MODEL || "gpt-4o-realtime-preview";
  console.log("Connecting to OpenAI standard API...");
  return new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });
};

/**
 * Creates and configures a WebSocket connection to Azure OpenAI's real-time API.
 */
const connectToAzureOpenAI = () => {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT; // e.g., https://my-azure-service.openai.azure.com
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION; // plus besoin de défaut ici

  if (!endpoint || !deploymentName || !apiKey) {
    console.error(
      "Azure OpenAI environment variables not set: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT_NAME, AZURE_OPENAI_API_KEY"
    );
    process.exit(1);
  }

  // on accepte les deux formes dans .env
  const cleanEndpoint = endpoint.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  // ⚠️ azure realtime nouvelle forme :
  // wss://{resource}.openai.azure.com/openai/v1/realtime?model={deployment}
  const url = `wss://${cleanEndpoint}/openai/v1/realtime?model=${deploymentName}`;
  console.log(`Connecting to Azure OpenAI API at: ${url}`);

  return new WebSocket(url, {
    headers: {
      "api-key": apiKey,
      "OpenAI-Beta": "realtime=v1",
    },
    // Ajout de cette ligne pour contourner le proxy d'entreprise
    rejectUnauthorized: false     
  });
};

// ---------------------------------------------------------------------
// Stream Processing
// ---------------------------------------------------------------------

let globalDownsampler = null;
let globalUpsampler = null;

const initializeResamplers = async () => {
  try {
    globalDownsampler = await create(1, 24000, 8000);
    globalUpsampler = await create(1, 8000, 24000);
    console.log("Global audio resamplers initialized");
  } catch (error) {
    console.error("Error initializing resamplers:", error);
    process.exit(1);
  }
};

const handleClientConnection = (clientWs) => {
  console.log("New client WebSocket connection received");
  let sessionUuid = null;

  let audioBuffer8k = [];
  let ws = null;
  // on mémorise si on est en Azure pour adapter la session
  const isAzure = !!process.env.AZURE_OPENAI_ENDPOINT;

  function processOpenAIAudioChunk(inputBuffer) {
    const inputSamples = new Int16Array(
      inputBuffer.buffer,
      inputBuffer.byteOffset,
      inputBuffer.length / 2
    );
    const downsampledSamples = globalDownsampler.full(inputSamples);
    audioBuffer8k = audioBuffer8k.concat(Array.from(downsampledSamples));

    const audioFrames = [];
    while (audioBuffer8k.length >= 160) {
      const frame = audioBuffer8k.slice(0, 160);
      audioBuffer8k = audioBuffer8k.slice(160);
      audioFrames.push(Buffer.from(Int16Array.from(frame).buffer));
    }

    return audioFrames;
  }

  function convert8kTo24k(inputBuffer) {
    const inputSamples = new Int16Array(
      inputBuffer.buffer,
      inputBuffer.byteOffset,
      inputBuffer.length / 2
    );
    const upsampledSamples = globalUpsampler.full(inputSamples);
    return Buffer.from(Int16Array.from(upsampledSamples).buffer);
  }

  clientWs.on("message", (data) => {
    try {
      const message = JSON.parse(data);
      switch (message.type) {
        case "init":
          sessionUuid = message.uuid;
          console.log("Session UUID:", sessionUuid);
          initializeOpenAIConnection();
          break;

        case "audio":
          if (message.audio && ws && ws.readyState === WebSocket.OPEN) {
            const audioBuffer = Buffer.from(message.audio, "base64");
            const upsampledAudio = convert8kTo24k(audioBuffer);
            ws.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: upsampledAudio.toString("base64"),
              })
            );
          }
          break;

        default:
          console.log("Unknown message type from client:", message.type);
          break;
      }
    } catch (error) {
      console.error("Error processing client message:", error);
    }
  });

  const initializeOpenAIConnection = () => {
    if (isAzure) {
      ws = connectToAzureOpenAI();
    } else {
      ws = connectToOpenAI();
    }

    ws.on("open", async () => {
      console.log(
        `WebSocket connected to AI backend (${isAzure ? "Azure" : "OpenAI"})`
      );

      let obj;

      if (isAzure) {
        // ==== BRANCHE AZURE ====
        obj = {
          type: "session.update",
          session: {
            type: "realtime",
            instructions:
              "You are a helpful assistant that can answer questions and help with tasks.",
            // temperature: +process.env.OPENAI_TEMPERATURE || 0.8,
            // Azure utilise parfois "max_output_tokens" plutôt que "max_response_output_tokens"
            // on reste conservateur : on met les deux
            max_output_tokens: +process.env.OPENAI_MAX_TOKENS || 1024,
          },
        };

        // instructions depuis l'env
        if (process.env.OPENAI_INSTRUCTIONS) {
          console.log("Using OPENAI_INSTRUCTIONS from environment variable");
          obj.session.instructions = process.env.OPENAI_INSTRUCTIONS;
        }

        // outils
        try {
          obj.session.tools = loadTools();
          console.log(`Loaded ${obj.session.tools.length} tools for OpenAI`);
        } catch (error) {
          console.error(`Error loading tools for OpenAI: ${error.message}`);
        }

      } else {
        // ==== BRANCHE OPENAI STANDARD ====
        obj = {
          type: "session.update",
          session: {
            input_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1",
            },
            output_audio_format: "pcm16",
            instructions:
              "You are a helpful assistant that can answer questions and help with tasks.",
            temperature: +process.env.OPENAI_TEMPERATURE || 0.8,
            max_response_output_tokens: +process.env.OPENAI_MAX_TOKENS || "inf",
          },
        };

        if (process.env.OPENAI_INSTRUCTIONS) {
          console.log("Using OPENAI_INSTRUCTIONS from environment variable");
          obj.session.instructions = process.env.OPENAI_INSTRUCTIONS;
        }

        try {
          obj.session.tools = loadTools();
          console.log(`Loaded ${obj.session.tools.length} tools for OpenAI`);
        } catch (error) {
          console.error(`Error loading tools for OpenAI: ${error.message}`);
        }
      }

      console.log(obj.session);
      ws.send(JSON.stringify(obj));
    });    

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data);

        switch (message.type) {
          case "error":
            console.error("AI API error:", message.error);
            clientWs.send(
              JSON.stringify({
                type: "error",
                message: message.error?.message || "Unknown error",
              })
            );
            break;

          case "session.updated":
            console.log("Session updated:", message);
            await ws.send(
              JSON.stringify({
                type: "response.create",
              })
            );
            break;

          // Azure
          case "response.output_audio.delta":          
          

          case "response.output_audio_transcript.delta":
            // si tu veux aussi renvoyer les sous-titres vers le core
            clientWs.send(
              JSON.stringify({
                type: "transcript",
                role: "agent",
                text: message.delta,
              })
            );

          // OpenAI
          case "response.audio.delta":
            const audioChunk = Buffer.from(message.delta, "base64");
            const audioFrames = processOpenAIAudioChunk(audioChunk);
            audioFrames.forEach((frame) => {
              clientWs.send(
                JSON.stringify({
                  type: "audio",
                  audio: frame.toString("base64"),
                })
              );
            });
            break;

          case "response.function_call_arguments.done":
            console.log("Function call arguments streaming completed", message);
            const handler = getToolHandler(message.name);
            if (!handler) {
              console.error(`No handler found for tool: ${message.name}`);
              return;
            }
            try {
              const content = await handler(
                sessionUuid,
                JSON.parse(message.arguments)
              );
              ws.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    instructions: content,
                  },
                })
              );
            } catch (error) {
              console.error(`Error executing tool ${message.name}:`, error);
              return;
            }
            break;

          case "response.audio_transcript.done":
            clientWs.send(
              JSON.stringify({
                type: "transcript",
                role: "agent",
                text: message.transcript,
              })
            );
            break;

          case "input_audio_buffer.speech_started":
            console.log("Audio streaming started");
            clientWs.send(JSON.stringify({ type: "interruption" }));
            break;

          case "conversation.item.input_audio_transcription.completed":
            clientWs.send(
              JSON.stringify({
                type: "transcript",
                role: "user",
                text: message.transcript,
              })
            );
            break;

          default:
            console.log("Received message type:", message.type);
            break;
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      console.log("AI WebSocket connection closed");
      cleanup();
    });

    ws.on("error", (err) => {
      console.error("AI WebSocket error:", err);
      cleanup();
    });
  };

  clientWs.on("close", () => {
    console.log("Client WebSocket connection closed");
    cleanup();
  });

  clientWs.on("error", (err) => {
    console.error("Client WebSocket error:", err);
    cleanup();
  });

  function cleanup() {
    if (ws) ws.close();
    if (clientWs) clientWs.close();
  }
};

// ---------------------------------------------------------------------
// global cleanup + start server
// ---------------------------------------------------------------------

const cleanupGlobalResources = () => {
  console.log("Cleaning up global resources...");
  if (globalDownsampler) {
    globalDownsampler.destroy();
    globalDownsampler = null;
  }
  if (globalUpsampler) {
    globalUpsampler.destroy();
    globalUpsampler = null;
  }
  console.log("Global resources cleaned up");
};

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");
  cleanupGlobalResources();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  cleanupGlobalResources();
  process.exit(0);
});

const startServer = async () => {
  try {
    await initializeResamplers();
    const PORT = process.env.PORT || 6030;
    const wss = new WebSocket.Server({ port: PORT });

    wss.on("connection", (clientWs) => {
      console.log("New client connected");
      handleClientConnection(clientWs);
    });

    console.log(
      `OpenAI/Azure Speech-to-Speech WebSocket server running on port ${PORT}`
    );
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
