# ⏱ QRONOS 2.0 · Eficiencia Inteligente

> Plataforma ejecutiva PWA de análisis de eficiencia industrial con IA real (Gemini API), gráficas, voz y chat inteligente.

---

## 📁 Estructura del Proyecto

```
qronos/
├── index.html          ← App PWA principal (frontend)
├── styles.css          ← Estilos premium ejecutivos
├── app.js              ← Lógica frontend (charts, voz, chat, datos)
├── server.js           ← Backend Express + integración Gemini
├── manifest.json       ← Manifiesto PWA
├── service-worker.js   ← Service Worker (caché offline)
├── package.json        ← Dependencias Node.js
├── .env.example        ← Plantilla de variables de entorno
├── .gitignore
├── icons/              ← Iconos PWA (debes generarlos, ver abajo)
│   ├── icon-192.png
│   ├── icon-512.png
│   └── ...
└── README.md
```

---

## 🚀 Instalación y Ejecución Local

### 1. Pre-requisitos

- **Node.js** v18 o superior → [nodejs.org](https://nodejs.org)
- **Gemini API Key** gratuita → [aistudio.google.com](https://aistudio.google.com/app/apikey)

### 2. Instalar dependencias

```bash
cd qronos
npm install
```

### 3. Configurar variables de entorno

```bash
# Copia el archivo de ejemplo
cp .env.example .env

# Edita .env y pega tu clave de Gemini:
# API_KEY=AIzaSy...TU_CLAVE_AQUI
```

**Contenido del `.env`:**
```env
API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
PORT=3000
NODE_ENV=development
```

### 4. Iniciar el backend

```bash
# Modo producción
npm start

# Modo desarrollo (recarga automática)
npm run dev
```

Verás en consola:
```
╔═══════════════════════════════════════════╗
║        QRONOS 2.0 · Backend IA           ║
╠═══════════════════════════════════════════╣
║  ✅ Servidor en: http://localhost:3000   ║
║  📡 Gemini: ✅ Configurado              ║
╚═══════════════════════════════════════════╝
```

### 5. Abrir el frontend

Abre `index.html` directamente en el navegador, o usa un servidor local (recomendado para PWA):

```bash
# Opción A — VS Code con Live Server (extensión)
# Click derecho en index.html → "Open with Live Server"

# Opción B — npx http-server
npx http-server . -p 5500 -o

# Opción C — Python
python -m http.server 5500
```

Luego visita: **[http://localhost:5500](http://localhost:5500)**

---

## 🌐 Endpoints del Backend

### `GET /health`
Verifica que el servidor esté activo.

```bash
curl http://localhost:3000/health
```

Respuesta:
```json
{
  "status": "online",
  "version": "2.0.0",
  "gemini": "configured",
  "uptime": "42s"
}
```

---

### `POST /analizar`
Envía una pregunta y datos de eficiencia → recibe análisis de Gemini.

**Request:**
```json
POST http://localhost:3000/analizar
Content-Type: application/json

{
  "pregunta": "¿Qué planta está peor y por qué?",
  "datos": {
    "fecha_reporte": "2025-01-15",
    "snapshot_dia": [
      { "planta": "Planta A", "eficiencia": 91.5, "meta": 90 },
      { "planta": "Planta B", "eficiencia": 82.3, "meta": 88 },
      { "planta": "Planta C", "eficiencia": 94.1, "meta": 90 }
    ],
    "historial_7_dias": {
      "Planta A": [
        { "fecha": "2025-01-14", "eficiencia": 89.2, "meta": 90 }
      ]
    }
  }
}
```

**Respuesta:**
```json
{
  "ok": true,
  "respuesta": "📊 **Análisis Ejecutivo — 15 Ene 2025**\n\n⚠️ **Planta Crítica:** Planta B...",
  "modelo": "gemini-1.5-flash-latest",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Ejemplo desde JavaScript (fetch):**
```javascript
const response = await fetch('http://localhost:3000/analizar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pregunta: '¿Qué planta necesita atención urgente?',
    datos: {
      fecha_reporte: '2025-01-15',
      snapshot_dia: [
        { planta: 'Planta A', eficiencia: 91.5, meta: 90 },
        { planta: 'Planta B', eficiencia: 78.3, meta: 88 },
      ],
      historial_7_dias: {}
    }
  })
});

const { respuesta } = await response.json();
console.log(respuesta);
```

---

## 🎙️ Comandos de Voz

Haz clic en el ícono de micrófono 🎙 y di:

| Comando | Acción |
|---------|--------|
| `"Qronos, resumen de eficiencias"` | Lee el reporte ejecutivo completo |
| `"Qronos, peor planta"` | Informa la planta con menor eficiencia |
| `"Qronos, mejor planta"` | Informa la planta con mayor eficiencia |
| `"Detener"` / `"Para"` | Detiene la lectura de voz |
| Cualquier frase | Se envía al chat de IA |

---

## 📱 Instalación como PWA

### iPhone (Safari)
1. Abre la app en Safari
2. Toca el ícono de compartir ⬆
3. Selecciona "Añadir a pantalla de inicio"
4. Toca "Añadir"

### Android (Chrome)
1. Abre la app en Chrome
2. Toca el menú ⋮ → "Instalar aplicación"
3. Confirma

### PC (Chrome / Edge)
1. En la barra de dirección aparece el ícono de instalación ⊕
2. Haz clic e instala

---

## 🎨 Iconos PWA

Necesitas generar los iconos. Usa tu logo en formato SVG/PNG y genera los tamaños:

```bash
# Opción fácil — usa pwa-asset-generator:
npx pwa-asset-generator tu-logo.png ./icons --manifest manifest.json
```

O usa [https://realfavicongenerator.net](https://realfavicongenerator.net) para generarlos online.

Tamaños necesarios: 72, 96, 128, 144, 152, 192, 384, 512 px.

---

## ☁️ Despliegue en Producción

### Backend (Node.js) → Railway / Render / Fly.io

```bash
# En Railway:
railway login
railway new
railway up

# Variables de entorno a configurar en el panel:
# API_KEY = tu_gemini_key
# PORT    = (automático)
```

### Frontend → Vercel / Netlify / GitHub Pages

Sube los archivos estáticos (`index.html`, `styles.css`, `app.js`, etc.) y actualiza en `app.js` la variable:

```javascript
const API_BASE = 'https://tu-backend.railway.app'; // URL de producción
```

---

## 🛡️ Seguridad

- ✅ La API Key de Gemini **NUNCA** está en el frontend
- ✅ La API Key se lee desde variables de entorno del servidor
- ✅ CORS configurado para orígenes específicos
- ✅ Validación de entrada en todos los endpoints
- ✅ Rate limiting recomendado para producción (añadir `express-rate-limit`)

---

## 📊 Funcionalidades

| Función | Estado |
|---------|--------|
| KPI cards por planta | ✅ |
| Gráfica de barras (día) | ✅ |
| Gráfica de tendencia (14 días) | ✅ |
| Ranking de plantas | ✅ |
| Alertas operacionales | ✅ |
| Edición de registros | ✅ |
| Persistencia LocalStorage | ✅ |
| Lectura por voz (TTS) | ✅ |
| Comandos de voz (STT) | ✅ |
| Chat con IA real (Gemini) | ✅ |
| Modo offline parcial | ✅ |
| PWA instalable | ✅ |
| Responsive móvil/PC | ✅ |
| Estructura lista para nube | ✅ |

---

## 🔧 Personalización

### Cambiar plantas
Edita en `app.js`:
```javascript
const PLANTAS_LIST = ['Planta A', 'Planta B', 'Planta C', 'Planta D', 'Planta E'];
```

### Cambiar meta por defecto
```javascript
const META_DEFAULT = 90; // %
```

### Cambiar modelo de Gemini
En `server.js`:
```javascript
const GEMINI_MODEL = 'gemini-1.5-pro-latest'; // Más potente
// o
const GEMINI_MODEL = 'gemini-1.5-flash-latest'; // Más rápido (default)
```

---

## 📄 Licencia

MIT © 2025 QRONOS Team
