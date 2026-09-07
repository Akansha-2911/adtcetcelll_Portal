# Local Run

Use these local environment values (do not use production secure cookies on localhost):

```env
NODE_ENV=development
PORT=5000
SESSION_SECURE=false
SESSION_SECRET=spvn_local_development_secret_key_123456789
MONGO_URI=your_mongodb_connection_string
OCR_PRIMARY=gemini
GEMINI_API_KEY=your_gemini_key
```

Commands:

```bash
npm install
npm run verify
npm start
```

Open: http://localhost:5000

For Render production use `NODE_ENV=production` and `SESSION_SECURE=true`.
