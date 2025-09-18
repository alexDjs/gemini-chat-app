# Gemini Chat App

Modern AI chat application using Gemini API and Express server.

## Features
- Chat with Gemini AI (Google GenAI)
- Modern, responsive UI
- Multi-line input, one Send button
- PDF upload and text extraction (optional)
- Download AI responses and code blocks
- Chat history with local storage

## Quick Start
1. Install dependencies:
   ```
   npm install
   ```
2. Add your API keys to `.env`:
   ```
   GEMINI_API_KEY=your_gemini_key
   OPENAI_API_KEY=your_openai_key
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open `script.html` in your browser.

## Project Structure
- `server.mjs` — Express backend, Gemini/OpenAI integration
- `script.html` — Frontend UI
- `package.json` — Project config
- `.gitignore` — Ignore secrets and build files

## License
MIT
