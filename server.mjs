
import { exec } from 'child_process';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Gemini API only - no OpenAI.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

let cachedModelCandidates = null;

const STATIC_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro'
];

async function getModelCandidates() {
  if (cachedModelCandidates) {
    return cachedModelCandidates;
  }

  const candidates = [];

  if (process.env.GEMINI_MODEL) {
    candidates.push(process.env.GEMINI_MODEL);
  }

  try {
    const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
    const response = await fetch(listModelsUrl);
    if (!response.ok) {
      throw new Error(`ListModels HTTP ${response.status}`);
    }

    const data = await response.json();
    const apiModels = (data.models || [])
      .filter((modelInfo) => (modelInfo.supportedGenerationMethods || []).includes('generateContent'))
      .map((modelInfo) => String(modelInfo.name || '').replace(/^models\//, ''))
      .filter(Boolean);

    candidates.push(...apiModels);
  } catch (error) {
    console.warn('⚠️ Could not load model list via ListModels:', error.message);
  }

  candidates.push(...STATIC_MODEL_CANDIDATES);

  cachedModelCandidates = [...new Set(candidates)];
  return cachedModelCandidates;
}

const isModelNotAvailableError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('404') || message.includes('not found') || message.includes('is not supported');
};

async function generateWithFallback(question, history = []) {
  let lastError = null;
  const modelCandidates = await getModelCandidates();

  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      let text;
      if (history.length === 0) {
        const result = await model.generateContent(question);
        text = result.response.text();
      } else {
        const chat = model.startChat({ history });
        const result = await chat.sendMessage(question);
        text = result.response.text();
      }
      return { text, modelName };
    } catch (error) {
      lastError = error;
      if (!isModelNotAvailableError(error)) {
        throw error;
      }
      console.warn(`⚠️ Model ${modelName} is unavailable, trying next...`);
    }
  }

  throw lastError || new Error('Could not select an available Gemini model');
}

console.log('🔑 API Key:', GEMINI_API_KEY ? 'OK' : '❌ NOT FOUND - add GEMINI_API_KEY to .env');

// In-memory chat session store.
const chatSessions = new Map();

// Main chat endpoint.
app.post('/ask', async (req, res) => {
  const { question, sessionId = 'default' } = req.body;
  
  if (!question) {
    return res.status(400).json({ reply: 'Question was not provided.' });
  }

  try {
    console.log('💭 Question:', question);
    console.log('🆔 Session:', sessionId);
    
    // Get or create a session.
    if (!chatSessions.has(sessionId)) {
      chatSessions.set(sessionId, {
        history: [],
        lastActivity: Date.now()
      });
      console.log('✨ New session created:', sessionId);
    }

    const session = chatSessions.get(sessionId);
    session.lastActivity = Date.now();

    // Send current history (without the new question) to chat, then append the pair.
    const modelResult = await generateWithFallback(question, session.history);
    const reply = modelResult.text;

    // Store the user/model pair in history.
    session.history.push(
      { role: 'user', parts: [{ text: question }] },
      { role: 'model', parts: [{ text: reply }] }
    );

    // Keep only the last 20 entries (10 pairs).
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    console.log(`🧠 Model: ${modelResult.modelName}`);
    console.log('🤖 Reply:', reply.substring(0, 100) + '...');
    res.json({ reply });
    
  } catch (e) {
    console.error('❌ Gemini error:', e.message);
    res.status(500).json({ reply: 'Error: ' + e.message });
  }
});

// Clear session endpoint.
app.post('/clear-session', (req, res) => {
  const { sessionId = 'default' } = req.body;
  console.log('🗑️ Clear session:', sessionId);
  
  if (chatSessions.has(sessionId)) {
    chatSessions.delete(sessionId);
    console.log('✅ Session cleared');
  }
  
  res.json({ success: true });
});

// Test endpoint.
app.post('/test-gemini', async (req, res) => {
  const { question } = req.body;
  try {
    const modelResult = await generateWithFallback(question || 'Hello!');
    res.json({ reply: modelResult.text, status: 'OK', model: modelResult.modelName });
  } catch (e) {
    console.error('❌ Test error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Serve static files from www.
app.use(express.static(path.join(__dirname, 'www')));

// Root page.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

// Start server.
const PORT = process.env.PORT || 3000;

function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`✅ Server started: http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚙️ Port ${PORT} is busy - freeing and restarting...`);
      exec(`for /f "tokens=5" %a in ('netstat -aon ^| find ":${PORT}" ^| find "LISTENING"') do taskkill /F /PID %a`, () => {
        setTimeout(startServer, 1000);
      });
    } else {
      console.error('❌ Server error:', err.message);
      process.exit(1);
    }
  });
}

startServer();
