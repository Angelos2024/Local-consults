# Dictado online con Whisper (OpenAI)

Este repo incluye un endpoint backend en `/api/transcribe` que usa la API de OpenAI para transcribir audio.

## Requisitos
- Node 18+
- Variable de entorno `OPENAI_API_KEY`

## Desarrollo local
```bash
npm install
# servir estático (por ejemplo con npx http-server) + funciones (recomendado: vercel dev)
# Opción 1 (Vercel):
npx vercel dev
```

## Deploy (Vercel)
1. Sube el repo a GitHub.
2. Importa el proyecto en Vercel.
3. En "Environment Variables" agrega `OPENAI_API_KEY`.
4. Deploy.

El front llama a `./api/transcribe`.
