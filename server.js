/* ============================================================
   QRONOS 2.0 · server.js
   Backend — Node.js + Express + Gemini API
   ============================================================
   Endpoints:
     GET  /health      → Status del servidor
     POST /analizar    → Análisis IA con Gemini
   ============================================================ */

'use strict';

const express  = require('express');
const cors     = require('cors');
const fetch    = require('node-fetch');   // node-fetch@2 para CommonJS
const fs       = require('fs');
const path     = require('path');
require('dotenv').config();

/* ── Directorio y archivo de datos ── */
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'records.json');

// Crear directorio de datos si no existe
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ records: [] }, null, 2));

const app  = express();
const PORT = process.env.PORT || 3000;

/* ──────────────────────────────────────────────
   MIDDLEWARES
   ────────────────────────────────────────────── */
app.use(cors({
  origin: [
    'http://localhost',
    'http://localhost:5500',
    'http://127.0.0.1',
    'http://127.0.0.1:5500',
    'http://localhost:3001',
    // Agrega tu dominio de producción aquí:
    // 'https://tu-dominio.com',
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '1mb' }));

/* ──────────────────────────────────────────────
   VALIDACIÓN DE API KEY
   ────────────────────────────────────────────── */
const GEMINI_API_KEY = process.env.API_KEY;
const GEMINI_MODEL   = 'gemini-1.5-flash-latest';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

if (!GEMINI_API_KEY) {
  console.error('\n⚠️  API_KEY no encontrada en variables de entorno.');
  console.error('   Crea un archivo .env con: API_KEY=tu_clave_de_gemini\n');
  // No cerramos el proceso para que se pueda probar /health
}

/* ──────────────────────────────────────────────
   PROMPT DEL SISTEMA — Director de Operaciones IA
   ────────────────────────────────────────────── */
const SYSTEM_PROMPT = `Eres un Director de Operaciones experto en eficiencia industrial con más de 20 años de experiencia en manufactura, gestión de KPIs y mejora continua (Lean, Six Sigma).

Analiza los datos reales de eficiencia de planta que se te proporcionan. Tu análisis debe:
1. Detectar desviaciones contra meta (positivas y negativas)
2. Identificar tendencias (mejora, deterioro, estabilidad)
3. Señalar las plantas con mejor y peor desempeño
4. Detectar riesgos operacionales potenciales
5. Dar recomendaciones específicas, accionables y priorizadas

REGLAS DE RESPUESTA:
- Responde SIEMPRE en español
- Sé ejecutivo, claro y conciso (máximo 300 palabras)
- Usa emojis de forma profesional para organizar visualmente (📊 🏆 ⚠️ 🔴 ✅ 💡)
- No inventes datos ni hagas suposiciones fuera de los datos provistos
- Si falta información, dilo explícitamente
- Estructura tu respuesta con secciones claras
- Prioriza las alertas más críticas primero`;

/* ──────────────────────────────────────────────
   HELPER — Construye el prompt dinámico
   ────────────────────────────────────────────── */
function buildPrompt(pregunta, datos) {
  const json = JSON.stringify(datos, null, 2);

  return `${SYSTEM_PROMPT}

---
📋 DATOS DE EFICIENCIA ACTUALES:
${json}

---
❓ PREGUNTA DEL OPERADOR:
${pregunta}

---
Responde de forma ejecutiva y estructurada:`;
}

/* ──────────────────────────────────────────────
   HELPER — Llamada a Gemini API
   ────────────────────────────────────────────── */
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('API_KEY no configurada en el servidor. Revisa el archivo .env');
  }

  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
        role: 'user',
      },
    ],
    generationConfig: {
      temperature:     0.4,     // Respuestas más determinísticas para análisis
      topK:            40,
      topP:            0.9,
      maxOutputTokens: 800,
      stopSequences:   [],
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  const response = await fetch(GEMINI_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Gemini API error:', response.status, errText);
    throw new Error(`Gemini API respondió con status ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // Extrae el texto de la respuesta
  const candidates = data?.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('Gemini no devolvió candidatos en la respuesta.');
  }

  const text = candidates[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini devolvió respuesta vacía o con formato inesperado.');
  }

  return text.trim();
}

/* ──────────────────────────────────────────────
   HELPERS — Lectura/escritura de registros
   ────────────────────────────────────────────── */
function readRecords() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.records) ? data.records : [];
  } catch (e) {
    console.warn('Error leyendo records.json:', e.message);
    return [];
  }
}

function writeRecords(records) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ records, updatedAt: new Date().toISOString() }, null, 2));
    return true;
  } catch (e) {
    console.error('Error escribiendo records.json:', e.message);
    return false;
  }
}

/* ──────────────────────────────────────────────
   ENDPOINT: GET /records
   Devuelve todos los registros almacenados
   (sincronización multi-dispositivo)
   ────────────────────────────────────────────── */
app.get('/records', (req, res) => {
  const records = readRecords();
  console.log(`[${new Date().toISOString()}] GET /records → ${records.length} registros`);
  res.json({ ok: true, records, count: records.length });
});

/* ──────────────────────────────────────────────
   ENDPOINT: POST /records
   Guarda/reemplaza todos los registros
   Body: { records: [...] }
   ────────────────────────────────────────────── */
app.post('/records', (req, res) => {
  const { records } = req.body;

  if (!Array.isArray(records)) {
    return res.status(400).json({ error: '"records" debe ser un array.' });
  }

  // Validación básica de cada registro
  const valid = records.every(r =>
    r.id && r.fecha && r.planta &&
    typeof r.eficiencia === 'number' &&
    typeof r.meta === 'number'
  );

  if (!valid) {
    return res.status(400).json({ error: 'Registros inválidos. Cada uno requiere: id, fecha, planta, eficiencia, meta.' });
  }

  const ok = writeRecords(records);
  if (!ok) return res.status(500).json({ error: 'Error guardando registros en el servidor.' });

  console.log(`[${new Date().toISOString()}] POST /records → ${records.length} registros guardados`);
  res.json({ ok: true, saved: records.length });
});


   Verifica que el servidor esté activo
   ────────────────────────────────────────────── */
app.get('/health', (req, res) => {
  res.json({
    status:  'online',
    version: '2.0.0',
    server:  'QRONOS 2.0 Backend',
    gemini:  GEMINI_API_KEY ? 'configured' : 'missing_api_key',
    uptime:  Math.floor(process.uptime()) + 's',
    timestamp: new Date().toISOString(),
  });
});

/* ──────────────────────────────────────────────
   ENDPOINT: POST /analizar
   Recibe pregunta + datos → llama a Gemini → devuelve respuesta
   
   Body esperado:
   {
     "pregunta": "¿Qué planta está peor?",
     "datos": {
       "fecha_reporte": "2025-01-15",
       "snapshot_dia": [...],
       "historial_7_dias": {...}
     }
   }
   ────────────────────────────────────────────── */
app.post('/analizar', async (req, res) => {
  const { pregunta, datos } = req.body;

  // Validaciones de entrada
  if (!pregunta || typeof pregunta !== 'string' || pregunta.trim().length === 0) {
    return res.status(400).json({ error: 'El campo "pregunta" es requerido y debe ser texto.' });
  }
  if (!datos || typeof datos !== 'object') {
    return res.status(400).json({ error: 'El campo "datos" es requerido y debe ser un objeto JSON.' });
  }
  if (pregunta.length > 500) {
    return res.status(400).json({ error: 'La pregunta no puede exceder 500 caracteres.' });
  }

  console.log(`\n[${new Date().toISOString()}] POST /analizar`);
  console.log(`   Pregunta: "${pregunta.slice(0, 80)}${pregunta.length > 80 ? '…' : ''}"`);
  console.log(`   Plantas en snapshot: ${datos.snapshot_dia?.length ?? 0}`);

  try {
    const prompt    = buildPrompt(pregunta.trim(), datos);
    const respuesta = await callGemini(prompt);

    console.log(`   ✅ Respuesta de Gemini (${respuesta.length} chars)`);

    return res.json({
      ok:        true,
      respuesta,
      modelo:    GEMINI_MODEL,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error(`   ❌ Error al llamar Gemini:`, err.message);

    const statusCode = err.message.includes('API_KEY') ? 503 : 500;

    return res.status(statusCode).json({
      ok:    false,
      error: err.message,
    });
  }
});

/* ──────────────────────────────────────────────
   MIDDLEWARE — Rutas no encontradas
   ────────────────────────────────────────────── */
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado', path: req.path });
});

/* ──────────────────────────────────────────────
   MIDDLEWARE — Manejo de errores global
   ────────────────────────────────────────────── */
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

/* ──────────────────────────────────────────────
   INICIO DEL SERVIDOR
   ────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║        QRONOS 2.0 · Backend IA           ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║  ✅ Servidor en: http://localhost:${PORT}     ║`);
  console.log(`║  📡 Gemini: ${GEMINI_API_KEY ? '✅ Configurado       ' : '❌ Falta API_KEY     '}  ║`);
  console.log(`║  📋 Modelo: ${GEMINI_MODEL.slice(0,20).padEnd(20)} ║`);
  console.log('╚═══════════════════════════════════════════╝\n');

  if (!GEMINI_API_KEY) {
    console.warn('⚠️  Para activar IA real, crea un archivo .env con:\n   API_KEY=TU_GEMINI_API_KEY\n');
  }
});

module.exports = app; // Para testing
module.exports = app;
