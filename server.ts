import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Serve static files from the www.spx6900.com directory
app.use(express.static(path.join(__dirname, "www.spx6900.com")));

// Lazy initialization of the Gemini SDK Client
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// In-Memory Leaderboard store pre-seeded with some high scores
const leaderboardStore: Record<string, { top: any[] }> = {};

function getBoard(song: string, difficulty: string) {
  const key = `${song}|${difficulty}`;
  if (!leaderboardStore[key]) {
    leaderboardStore[key] = {
      top: [
        { name: "Satoshi_69", score: 98200, accuracy: 98.2, maxCombo: 340, hits: 340, misses: 0, date: new Date(Date.now() - 86400000 * 2).toISOString() },
        { name: "StockFlipper", score: 85400, accuracy: 92.5, maxCombo: 280, hits: 310, misses: 10, date: new Date(Date.now() - 86400000).toISOString() },
        { name: "LuminaFan", score: 72100, accuracy: 88.0, maxCombo: 210, hits: 270, misses: 25, date: new Date(Date.now() - 3600000).toISOString() }
      ]
    };
  }
  return leaderboardStore[key];
}

// POST /api/chat - Lumina Chat Bot and Emotion Classifier
app.post("/api/chat", async (req: express.Request, res: express.Response) => {
  const { message, history, classify } = req.body;
  try {
    const gemini = getGemini();

    if (classify) {
      // Classification of emotion for a given text
      const response = await gemini.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `Classify the following cute anime virtual YouTuber reply into one of these emotions: 'happy', 'sad', 'idle', 'thinking'. Return ONLY a JSON object with a single field 'emotion'.
Text: "${classify}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              emotion: { type: Type.STRING, description: "Must be 'happy', 'sad', 'idle', or 'thinking'" }
            },
            required: ["emotion"]
          }
        }
      });
      const data = JSON.parse(response.text?.trim() || "{}");
      return res.json({ emotion: data.emotion || "idle" });
    }

    if (message) {
      // Convert history to Gemini contents structure
      const geminiHistory = (history || []).map((h: any) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content || "" }]
      }));

      const contents = [
        ...geminiHistory,
        { role: "user", parts: [{ text: message }] }
      ];

      const response = await gemini.models.generateContent({
        model: "gemini-3.7-flash",
        contents,
        config: {
          systemInstruction: "You are Lumina, the hyper-energetic, cute, and chaotic AI VTuber and guide for DJT4700 ($DJT4700) - flipping $DJT by mashing Trump meta with SPX market memes into a movement play! It pulls from Donald J. Trump's media group (TMTG/DJT ticker) and SPX-style index hype, using flag aesthetics and the 4700 nod to chase political crypto pumps on robinhood as a rival token. Official Telegram is https://t.me/DJT4700RH and X is https://x.com/djt4700rh. Speak with absolute belief and energy. Use keyboard characters, emojis, and a playful anime girl personality. You can perform actions on behalf of the user. If they ask you to draw something, set action to 'draw' and provide a descriptive 'draw_prompt' for what they want. If they ask to search or lookup something, set action to 'search' and set 'search_query' to what they want searched. If they mention music, you can set action to 'music' or choose to suggest a song.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING, description: "Your spoken chat reply to the user" },
              action: { type: Type.STRING, description: "Must be 'text', 'draw', 'search', or 'music'" },
              emotion: { type: Type.STRING, description: "Must be 'happy', 'sad', 'idle', or 'thinking'" },
              draw_prompt: { type: Type.STRING, description: "Descriptive visual prompt for drawing if action is 'draw'" },
              search_query: { type: Type.STRING, description: "Search query if action is 'search'" },
              fav_video: { type: Type.STRING, description: "Optional YouTube video ID or link about SPX6900" },
              fav_aeon: { type: Type.STRING, description: "Optional Project Aeon NFT ID" },
              fav_song: {
                type: Type.OBJECT,
                properties: {
                  file: { type: Type.STRING, description: "Filename of a song to play" }
                }
              }
            },
            required: ["reply", "action", "emotion"]
          }
        }
      });

      const data = JSON.parse(response.text?.trim() || "{}");
      return res.json(data);
    }

    res.status(400).json({ error: "Invalid request payload" });
  } catch (error: any) {
    console.error("Gemini Chat Error:", error);
    res.status(500).json({ error: error.message || "An error occurred with Gemini API" });
  }
});

// POST /api/draw - Image generation for Lumina
app.post("/api/draw", async (req: express.Request, res: express.Response) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }
  try {
    const gemini = getGemini();
    const response = await gemini.models.generateContent({
      model: "gemini-3.1-flash-lite-image",
      contents: {
        parts: [
          { text: `Anime style illustration of: ${prompt}` }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    let base64Image = "";
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        base64Image = part.inlineData.data || "";
        break;
      }
    }

    if (base64Image) {
      res.json({ success: true, image: `data:image/png;base64,${base64Image}` });
    } else {
      res.status(500).json({ success: false, error: "Image generation returned no image data" });
    }
  } catch (error: any) {
    console.error("Draw API Error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to generate image" });
  }
});

// POST /api/search - Custom SPX holographic visual search
app.post("/api/search", async (req: express.Request, res: express.Response) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Missing query" });
  }
  try {
    const gemini = getGemini();
    const response = await gemini.models.generateContent({
      model: "gemini-3.1-flash-lite-image",
      contents: {
        parts: [
          { text: `A futuristic hacker search archive hologram screen for: ${query}` }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    let base64Image = "";
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        base64Image = part.inlineData.data || "";
        break;
      }
    }

    if (base64Image) {
      res.json({ results: [{ image: `data:image/png;base64,${base64Image}` }] });
    } else {
      res.status(500).json({ error: "Failed to locate archive visual" });
    }
  } catch (error: any) {
    console.error("Search API Error:", error);
    res.status(500).json({ error: error.message || "Search failed" });
  }
});

// POST /api/aeon - Project Aeon metadata lookup
app.post("/api/aeon", (req: express.Request, res: express.Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: "ids must be an array of numbers" });
  }

  const nfts = ids.map(idStr => {
    const id = Number(idStr) || 0;
    const rarityRank = (id * 7 + 13) % 3333 + 1;
    const core = ["Quantum", "Plasma", "Fusion", "Dark Matter", "Entropy"][id % 5];
    const chassis = ["Chrome", "Carbon Fiber", "Matte Black", "Glow Neon", "Gold-Plated"][id % 5];
    const visor = ["Holographic", "Laser Red", "Cyber Cyan", "None", "Infinity Visor"][id % 5];
    const status = ["Active", "Locked", "Overcharged", "Glitched"][id % 4];

    return {
      id,
      name: `PROJECT AEON #${id}`,
      image: `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=aeon${id}`,
      imageFull: `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=aeon${id}`,
      rarityRank,
      traits: [
        { trait_type: "Core", value: core },
        { trait_type: "Chassis", value: chassis },
        { trait_type: "Visor", value: visor },
        { trait_type: "Status", value: status }
      ]
    };
  });

  res.json({ nfts });
});

// GET /api/leaderboard - Get rhythm game high scores
app.get("/api/leaderboard", (req: express.Request, res: express.Response) => {
  const songFiles = ["lumina.mp3", "aeon.mp3", "spx.mp3"];
  const diffs = ["easy", "normal", "hard"];
  for (const song of songFiles) {
    for (const diff of diffs) {
      getBoard(song, diff);
    }
  }
  res.json({ boards: leaderboardStore });
});

// POST /api/leaderboard - Post rhythm game high scores
app.post("/api/leaderboard", (req: express.Request, res: express.Response) => {
  const { song, difficulty, name, score, accuracy, maxCombo, hits, misses } = req.body;
  if (!song || !difficulty || !name) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const board = getBoard(song, difficulty);
  const newEntry = {
    name,
    score: Number(score) || 0,
    accuracy: Number(accuracy) || 0,
    maxCombo: Number(maxCombo) || 0,
    hits: Number(hits) || 0,
    misses: Number(misses) || 0,
    date: new Date().toISOString()
  };
  board.top.push(newEntry);
  board.top.sort((a, b) => b.score - a.score);
  board.top = board.top.slice(0, 10);
  res.json({ top: board.top });
});

// Fallback: send index.html for any other routes to allow SPA routing
app.get("*", (req: express.Request, res: express.Response) => {
  if (req.path.includes(".") || req.path.startsWith("/api/")) {
    return res.status(404).send("Not Found");
  }
  res.sendFile(path.join(__dirname, "www.spx6900.com", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
