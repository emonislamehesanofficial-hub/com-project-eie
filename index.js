// ============================================================
// meditation-server-v2
// Express + MongoDB + Multer powered Sound Engine
// ============================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// ============================================================
// MongoDB Connection
// ============================================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/serene';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ============================================================
// Upload directories — separate folders
// ============================================================
['uploads/meditations', 'uploads/ambient', 'uploads/artwork']
  .forEach(dir => fs.mkdirSync(dir, { recursive: true }));

// ============================================================
// Multer Storage — dynamic by upload type
// ============================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.uploadType;
    const dir =
      type === 'meditation' ? 'uploads/meditations' :
      type === 'ambient'    ? 'uploads/ambient' :
                              'uploads/artwork';
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    cb(null, id + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB max
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/');
    cb(ok ? null : new Error('Only audio or image files allowed'), ok);
  }
});

// ============================================================
// Schemas
// ============================================================
const MeditationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'Relaxation' },
  audioUrl: { type: String, required: true },
  artworkUrl: { type: String, default: '' },
  durationSeconds: { type: Number, default: 600 },
  fileSize: { type: Number, default: 0 },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now }
});
const Meditation = mongoose.model('Meditation', MeditationSchema);

const AmbientSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, default: 'Nature' },
  audioUrl: { type: String, required: true },
  iconName: { type: String, default: 'ic_nature_rain' },
  defaultVolume: { type: Number, default: 0.6 },
  isLooping: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Ambient = mongoose.model('Ambient', AmbientSchema);

// ============================================================
// Middleware — tag upload type
// ============================================================
const tagMeditation = (req, res, next) => { req.uploadType = 'meditation'; next(); };
const tagAmbient    = (req, res, next) => { req.uploadType = 'ambient';    next(); };

// ============================================================
// MEDITATION ROUTES
// ============================================================

// List all
app.get('/api/meditations', async (req, res) => {
  try {
    const list = await Meditation.find().sort({ createdAt: -1 });
    res.json({ items: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get one
app.get('/api/meditations/:id', async (req, res) => {
  try {
    const doc = await Meditation.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload new
app.post(
  '/api/meditations/upload',
  tagMeditation,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'artwork', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const audioFile = req.files?.audio?.[0];
      if (!audioFile) return res.status(400).json({ error: 'audio file required' });

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const artwork = req.files?.artwork?.[0];

      const doc = await Meditation.create({
        title: req.body.title || 'Untitled Meditation',
        description: req.body.description || '',
        category: req.body.category || 'Relaxation',
        durationSeconds: parseInt(req.body.durationSeconds || '600', 10),
        fileSize: audioFile.size,
        audioUrl: `${baseUrl}/uploads/meditations/${audioFile.filename}`,
        artworkUrl: artwork ? `${baseUrl}/uploads/artwork/${artwork.filename}` : ''
      });

      res.json({ ok: true, meditation: doc });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// Delete
app.delete('/api/meditations/:id', async (req, res) => {
  try {
    const doc = await Meditation.findByIdAndDelete(req.params.id);
    if (doc) {
      const rel = doc.audioUrl.split('/uploads/')[1];
      if (rel) fs.unlink(path.join('uploads', rel), () => {});
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// AMBIENT ROUTES
// ============================================================

app.get('/api/ambient', async (req, res) => {
  try {
    const list = await Ambient.find().sort({ createdAt: -1 });
    res.json({ items: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ambient/:id', async (req, res) => {
  try {
    const doc = await Ambient.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post(
  '/api/ambient/upload',
  tagAmbient,
  upload.fields([{ name: 'audio', maxCount: 1 }]),
  async (req, res) => {
    try {
      const audioFile = req.files?.audio?.[0];
      if (!audioFile) return res.status(400).json({ error: 'audio file required' });

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

      const doc = await Ambient.create({
        title: req.body.title || 'Untitled Ambient',
        category: req.body.category || 'Nature',
        iconName: req.body.iconName || 'ic_nature_rain',
        defaultVolume: parseFloat(req.body.defaultVolume || '0.6'),
        isLooping: req.body.isLooping !== 'false',
        audioUrl: `${baseUrl}/uploads/ambient/${audioFile.filename}`
      });

      res.json({ ok: true, ambient: doc });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

app.delete('/api/ambient/:id', async (req, res) => {
  try {
    const doc = await Ambient.findByIdAndDelete(req.params.id);
    if (doc) {
      const rel = doc.audioUrl.split('/uploads/')[1];
      if (rel) fs.unlink(path.join('uploads', rel), () => {});
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// Health check
// ============================================================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    name: 'meditation-server-v2',
    endpoints: {
      meditations: '/api/meditations',
      ambient: '/api/ambient'
    }
  });
});

// ============================================================
// Global Error Handler
// ============================================================
app.use((err, req, res, next) => {
  console.error('⚠️ Error:', err.message);
  res.status(500).json({ error: err.message });
});

// ============================================================
// Start server
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 meditation-server-v2 running on port ${PORT}`);
});
