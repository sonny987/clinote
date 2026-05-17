const functions  = require('firebase-functions');
const admin      = require('firebase-admin');
const fetch      = require('node-fetch');
const FormData   = require('form-data');
const Busboy     = require('busboy');

admin.initializeApp();

// ══════════════════════════════════════════════════════════
// WHISPER PROXY
// Modtager lydfil fra Notara, sender til OpenAI Whisper,
// returnerer transskriberet tekst.
// API nøglen ligger KUN her — aldrig i browseren.
// ══════════════════════════════════════════════════════════

exports.whisperProxy = functions
  .region('europe-west1')
  .runWith({ memory: '512MB', timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {

  // CORS — tillad kun din domæne i produktion
  const tilladt = [
    'https://notara.helgason.io',
    'http://localhost',
    'null', // Lokal fil-åbning under udvikling
  ];
  const origin = req.headers.origin || '';
  if (tilladt.includes(origin) || origin.startsWith('http://localhost') || !origin) {
    res.set('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.set('Access-Control-Allow-Origin', 'https://notara.helgason.io');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST')    { res.status(405).send('Method Not Allowed'); return; }

  // Hent Whisper API nøgle fra Firebase Environment Config
  // Sættes med: firebase functions:config:set openai.key="sk-..."
  const apiKey = functions.config().openai?.key;
  if (!apiKey) {
    console.error('Mangler openai.key i Firebase config');
    res.status(500).json({ error: 'Server ikke konfigureret' });
    return;
  }

  try {
    // Parse multipart form data (lydfilen)
    const { audioBuffer, mimeType } = await parseAudioUpload(req);

    // Send til Whisper
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: 'diktering.webm',
      contentType: mimeType || 'audio/webm',
    });
    form.append('model', 'whisper-1');
    form.append('language', 'da');
    form.append('prompt',
      'Dansk klinisk dokumentation. Fagtermer: TOKS, saturation, blodtryk, puls, ' +
      'temperatur, GCS, respirationsfrekvens, dysfagi, apopleksi, trombose, ' +
      'intravenøst, subkutant, peroralt, gives, dagligt, gange.'
    );

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, ...form.getHeaders() },
      body:    form,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      console.error('Whisper fejl:', err);
      res.status(502).json({ error: 'Whisper fejl', details: err });
      return;
    }

    const data = await whisperRes.json();

    // Log brug til Firebase (til statistik og fakturering)
    await logBrug(req, data.text?.length || 0);

    res.json({ text: data.text || '' });

  } catch (e) {
    console.error('Proxy fejl:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Parse lydfil fra multipart request ──
function parseAudioUpload(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    let audioBuffer = null;
    let mimeType    = 'audio/webm';

    bb.on('file', (name, file, info) => {
      mimeType = info.mimeType || 'audio/webm';
      const chunks = [];
      file.on('data',  d => chunks.push(d));
      file.on('end',   ()=> { audioBuffer = Buffer.concat(chunks); });
    });

    bb.on('finish', () => {
      if (!audioBuffer) reject(new Error('Ingen lydfil modtaget'));
      else resolve({ audioBuffer, mimeType });
    });

    bb.on('error', reject);
    req.pipe(bb);
  });
}

// ── Log brug til Firestore ──
async function logBrug(req, tegnAntal) {
  try {
    const db = admin.firestore();
    await db.collection('whisper_log').add({
      timestamp:  admin.firestore.FieldValue.serverTimestamp(),
      origin:     req.headers.origin || 'ukendt',
      tegnAntal,
      ip:         req.ip,
    });
  } catch(e) {
    // Log fejl er ikke kritisk
    console.warn('Log fejl:', e.message);
  }
}
