import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import OpenAI from "openai";
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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

// Хранилище для истории чатов по сессиям
const chatSessions = new Map();

// Функция для очистки старых сессий (каждые 30 минут)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of chatSessions.entries()) {
    if (now - session.lastActivity > 30 * 60 * 1000) { // 30 минут
      chatSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Проверяем каждые 5 минут

app.post('/ask', async (req, res) => {
  let { question, sessionId = 'default' } = req.body;
  if (!question) {
    return res.status(400).json({ reply: 'Вопрос не получен.' });
  }

  try {
    console.log('Sending question to Gemini:', question);
    console.log('Session ID:', sessionId);
    
    // Получаем или создаем сессию
    if (!chatSessions.has(sessionId)) {
      chatSessions.set(sessionId, {
        history: [],
        lastActivity: Date.now()
      });
      console.log('Created new session:', sessionId);
    }

    const session = chatSessions.get(sessionId);
    session.lastActivity = Date.now();

    // Добавляем новый вопрос пользователя в историю
    // Добавляем промпт для структурированного ответа
    const formattingPrompt = `\n\nПожалуйста, дай ответ в структурированной форме: используй абзацы, списки, выделение, emoji (если уместно), таблицы для сложных данных. Не используй длинные простыни текста. Если есть код — оформи как блок. Если есть пункты — оформи как маркированный или нумерованный список. Если можно, добавь заголовки. Ответ должен быть красивым и легко читаемым.`;
    session.history.push({
      role: 'user',
      parts: [{ text: question + formattingPrompt }]
    });

    // Ограничиваем историю последними 20 сообщениями (10 пар вопрос-ответ)
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    console.log('Current session history length:', session.history.length);

    // Если это первое сообщение, отправляем просто вопрос
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

      // Добавляем ответ AI в историю
      session.history.push({
        role: 'model',
        parts: [{ text: reply }]
      });

      console.log('First message reply:', reply.substring(0, 100) + '...');
      res.json({ reply: reply || 'Нет ответа от Gemini.' });
    } else {
      // Если это не первое сообщение, отправляем всю историю
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

      // Добавляем ответ AI в историю
      session.history.push({
        role: 'model',
        parts: [{ text: reply }]
      });

      console.log('Context-aware reply:', reply.substring(0, 100) + '...');
      res.json({ reply: reply || 'Нет ответа от Gemini.' });
    }

  } catch (e) {
    console.error('AI error:', e);
    console.error('Error details:', e.message, e.stack);
    res.status(500).json({ reply: 'Ошибка AI или сети: ' + e.message });
  }
});

// Новый эндпоинт для очистки истории сессии
app.post('/clear-session', (req, res) => {
  const { sessionId = 'default' } = req.body;
  console.log('Clearing session:', sessionId);
  if (chatSessions.has(sessionId)) {
    chatSessions.delete(sessionId);
    console.log('Session cleared successfully');
  }
  res.json({ success: true });
});

// Эндпоинт для отладки сессий
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

// Тестовый эндпоинт для проверки Gemini API
app.post('/test-gemini', async (req, res) => {
  const { question } = req.body;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: question || 'Привет!',
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

// Эндпоинт загрузки файлов отключён

app.use('/uploads', express.static(uploadDir));

app.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});
