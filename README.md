
# Gemini Chat App

Modern AI chat application using Gemini API and Express server. Works locally и на Render.

## Features
- Chat with Gemini AI (Google GenAI)
- Modern, responsive UI
- Multi-line input, one Send button
- PDF upload and text extraction (optional)
- Download AI responses and code blocks
- Chat history with local storage
- Ready for cloud deployment (Render)

## Quick Start (Local)
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
4. Откройте в браузере: [http://localhost:3000](http://localhost:3000)

## Deploy to Render
1. Push your code to GitHub.
2. Create a new Web Service on [Render](https://render.com).
3. Connect your GitHub repo.
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variables:
   - `GEMINI_API_KEY=your_gemini_key`
   - `OPENAI_API_KEY=your_openai_key`
7. After deploy, open your Render URL in browser.

## Project Structure
- `server.mjs` — Express backend, Gemini/OpenAI integration, serves static files
- `script.html` — Frontend UI
- `package.json` — Project config
- `.gitignore` — Ignore secrets and build files
- `.env` — API keys (not in repo)

## License
MIT
