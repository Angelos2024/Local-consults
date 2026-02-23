import OpenAI from 'openai';
import Busboy from 'busboy';
import fs from 'fs';
import os from 'os';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }));
      return;
    }

    const { filePath, fields } = await parseMultipart(req);

    const model = fields.model || 'gpt-4o-mini-transcribe';
    const language = fields.language || 'es';
    const prompt = fields.prompt || '';

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model,
      language,
      prompt,
      temperature: 0,
      response_format: 'json',
    });

    cleanup(filePath);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ text: transcription?.text || '' }));
  } catch (err) {
    console.error('Transcribe error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Transcription failed', message: String(err?.message || err) }));
  }
}

function cleanup(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: {
        fileSize: 25 * 1024 * 1024,
        files: 1,
      },
    });

    const fields = {};
    let filePath = '';
    let fileWriteDone = null;

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (name, file, info) => {
      if (name !== 'audio' && name !== 'file') {
        file.resume();
        return;
      }
      const ext = inferExtension(info?.mimeType) || 'webm';
      filePath = path.join(os.tmpdir(), `audio-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`);
      const out = fs.createWriteStream(filePath);

      fileWriteDone = new Promise((res, rej) => {
        out.on('close', res);
        out.on('error', rej);
      });

      file.pipe(out);
    });

    bb.on('error', reject);

    bb.on('finish', async () => {
      try {
        if (!filePath) throw new Error('No audio file received');
        if (fileWriteDone) await fileWriteDone;
        resolve({ filePath, fields });
      } catch (e) {
        reject(e);
      }
    });

    req.pipe(bb);
  });
}

function inferExtension(mime = '') {
  if (!mime) return '';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  return '';
}
