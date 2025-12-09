
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Session-scoped chat history store
const chatSessions = new Map();

// Cleanup stale sessions (every 30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of chatSessions.entries()) {
    if (now - session.lastActivity > 30 * 60 * 1000) { // 30 minutes
      chatSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

app.post('/ask', async (req, res) => {
  let { question, sessionId = 'default' } = req.body;
  if (!question) {
    return res.status(400).json({ reply: 'Question not received.' });
  }

  try {
    console.log('Sending question to Gemini:', question);
    console.log('Session ID:', sessionId);
    
    // Get or create session
    if (!chatSessions.has(sessionId)) {
      chatSessions.set(sessionId, {
        history: [],
        lastActivity: Date.now()
      });
      console.log('Created new session:', sessionId);
    }

    const session = chatSessions.get(sessionId);
    session.lastActivity = Date.now();

    // Add the new user question to history
    // Add prompt asking for structured output
    const formattingPrompt = `\n\nPlease provide a structured answer: use paragraphs, lists, emphasis, emoji (if appropriate), tables for complex data. Don't use long walls of text. If there's code — format it as a block. If there are points — format as a bulleted or numbered list. If possible, add headings. The answer should be beautiful and easy to read.`;
    session.history.push({
      role: 'user',
      parts: [{ text: question + formattingPrompt }]
    });

    // Keep only the last 20 messages (10 Q/A pairs)
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    console.log('Current session history length:', session.history.length);

    // If this is the first message, send the plain question
    if (session.history.length === 1) {
      const response = await ai.models.generateContentStream({
        model: 'gemini-2.0-flash-001',
        contents: question,
      });
      
      let reply = '';
      for await (const chunk of response) {
        if (chunk.text) {
          reply += chunk.text;
        }
      }

      // Store AI reply in history
      session.history.push({
        role: 'model',
        parts: [{ text: reply }]
      });

      console.log('First message reply:', reply.substring(0, 100) + '...');
      res.json({ reply: reply || 'No response from Gemini.' });
    } else {
      // Otherwise send the full conversation history
      console.log('Sending conversation history to Gemini');
      
      const response = await ai.models.generateContentStream({
        model: 'gemini-2.0-flash-001',
        contents: session.history,
      });
      
      let reply = '';
      for await (const chunk of response) {
        if (chunk.text) {
          reply += chunk.text;
        }
      }

      // Store AI reply in history
      session.history.push({
        role: 'model',
        parts: [{ text: reply }]
      });

      console.log('Context-aware reply:', reply.substring(0, 100) + '...');
      res.json({ reply: reply || 'No response from Gemini.' });
    }

  } catch (e) {
    console.error('AI error:', e);
    console.error('Error details:', e.message, e.stack);
    res.status(500).json({ reply: 'AI or network error: ' + e.message });
  }
});

// Endpoint to clear a session history
app.post('/clear-session', (req, res) => {
  const { sessionId = 'default' } = req.body;
  console.log('Clearing session:', sessionId);
  if (chatSessions.has(sessionId)) {
    chatSessions.delete(sessionId);
    console.log('Session cleared successfully');
  }
  res.json({ success: true });
});

// Endpoint for session debugging
app.get('/debug-sessions', (req, res) => {
  const sessionsInfo = {};
  for (const [sessionId, session] of chatSessions.entries()) {
    sessionsInfo[sessionId] = {
      historyLength: session.history.length,
      lastActivity: new Date(session.lastActivity).toISOString(),
      lastMessage: session.history.length > 0 ? 
        session.history[session.history.length - 1].parts[0].text.substring(0, 50) + '...' : 
        'No messages'
    };
  }
  res.json({ 
    totalSessions: chatSessions.size,
    sessions: sessionsInfo 
  });
});

// Test endpoint for Gemini API
app.post('/test-gemini', async (req, res) => {
  const { question } = req.body;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: question || 'Hello!',
    });
    const reply = response.text || (response.candidates && response.candidates[0] ? 
      response.candidates[0].content.parts.map(p => p.text).join('\n') : 'No text');
    res.json({ reply, raw: response });
  } catch (e) {
    console.error('Test Gemini error:', e);
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

app.post('/generate-image', async (req, res) => {
  const { prompt } = req.body;
  try {
    const response = await openai.images.generate({
      prompt,
      n: 1,
      size: "512x512"
    });
    const imageUrl = response.data[0].url;
    res.json({ imageUrl });
  } catch (e) {
    console.error('Image generation error:', e);
    res.json({
      imageUrl: 'https://placehold.co/512x300?text=Image+Error'
    });
  }
});

// File upload endpoint is disabled


// Serve all static files from project root
app.use(express.static(__dirname));

// Main page — script.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'script.html'));
});

app.use('/uploads', express.static(uploadDir));

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
