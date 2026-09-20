// ============================================================
// SERENE BACKEND v2 — Meditation & Sound Management
// Stack: Express + MongoDB + Multer
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));
app.use('/', express.static('public'));

// MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/serene';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// Upload directories
['uploads/meditations/audio', 'uploads/meditations/thumbs',
 'uploads/sounds/audio', 'uploads/sounds/thumbs']
  .forEach(dir => fs.mkdirSync(dir, { recursive: true }));

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const cat = req.uploadCategory || 'meditations';
    const kind = file.fieldname === 'audio' ? 'audio' : 'thumbs';
    cb(null, `uploads/${cat}/${kind}`);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    cb(null, id + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 }
});

const meditationUpload = (req, res, next) => { req.uploadCategory = 'meditations'; next(); };
const soundUpload = (req, res, next) => { req.uploadCategory = 'sounds'; next(); };

const uploadFields = upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Schemas
const commonFields = {
  title: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'General' },
  tags: [{ type: String }],
  audioUrl: { type: String, required: true },
  thumbnailUrl: { type: String, default: '' },
  durationSeconds: { type: Number, default: 0 },
  fileSize: { type: Number, default: 0 },
  sortOrder: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
};

const Meditation = mongoose.model('Meditation', new mongoose.Schema(commonFields));
const Sound = mongoose.model('Sound', new mongoose.Schema(commonFields));

// Helpers
const baseUrl = (req) => process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
const buildFileUrl = (req, filePath) => {
  if (!filePath) return '';
  const rel = filePath.replace(/\\/g, '/');
  return `${baseUrl(req)}/${rel}`;
};
const extractRelative = (url, category, kind) => {
  const m = url && url.match(new RegExp(`uploads/${category}/${kind}/[^/]+$`));
  return m ? m[0] : null;
};

// ============================================================
// MEDITATION ROUTES
// ============================================================

app.get('/api/meditations', async (req, res) => {
  try {
    const query = {};
    if (req.query.published === 'true') query.isPublished = true;
    if (req.query.active === 'true') query.isActive = true;
    const list = await Meditation.find(query).sort({ sortOrder: 1, createdAt: -1 });
    res.json({ items: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/meditations/:id', async (req, res) => {
  try {
    const doc = await Meditation.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/meditations', meditationUpload, uploadFields, async (req, res) => {
  try {
    const audioFile = req.files?.audio?.[0];
    if (!audioFile) return res.status(400).json({ error: 'Audio required' });

    const thumbFile = req.files?.thumbnail?.[0];
    const tags = req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    const doc = await Meditation.create({
      title: req.body.title || 'Untitled',
      description: req.body.description || '',
      category: req.body.category || 'General',
      tags,
      audioUrl: buildFileUrl(req, audioFile.path),
      thumbnailUrl: thumbFile ? buildFileUrl(req, thumbFile.path) : '',
      durationSeconds: parseInt(req.body.durationSeconds || '0', 10),
      fileSize: audioFile.size,
      sortOrder: parseInt(req.body.sortOrder || '0', 10),
      isPublished: req.body.isPublished !== 'false',
      isFeatured: req.body.isFeatured === 'true',
      isActive: req.body.isActive !== 'false'
    });
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/meditations/:id', meditationUpload, uploadFields, async (req, res) => {
  try {
    const doc = await Meditation.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const audioFile = req.files?.audio?.[0];
    if (audioFile) {
      const oldRel = extractRelative(doc.audioUrl, 'meditations', 'audio');
      if (oldRel) fs.unlink(oldRel, () => {});
      doc.audioUrl = buildFileUrl(req, audioFile.path);
      doc.fileSize = audioFile.size;
    }
    const thumbFile = req.files?.thumbnail?.[0];
    if (thumbFile) {
      const oldRel = extractRelative(doc.thumbnailUrl, 'meditations', 'thumbs');
      if (oldRel) fs.unlink(oldRel, () => {});
      doc.thumbnailUrl = buildFileUrl(req, thumbFile.path);
    }

    if (req.body.title !== undefined) doc.title = req.body.title;
    if (req.body.description !== undefined) doc.description = req.body.description;
    if (req.body.category !== undefined) doc.category = req.body.category;
    if (req.body.tags !== undefined) doc.tags = req.body.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (req.body.durationSeconds !== undefined) doc.durationSeconds = parseInt(req.body.durationSeconds, 10);
    if (req.body.sortOrder !== undefined) doc.sortOrder = parseInt(req.body.sortOrder, 10);
    if (req.body.isPublished !== undefined) doc.isPublished = req.body.isPublished === 'true';
    if (req.body.isFeatured !== undefined) doc.isFeatured = req.body.isFeatured === 'true';
    if (req.body.isActive !== undefined) doc.isActive = req.body.isActive === 'true';
    doc.updatedAt = new Date();

    await doc.save();
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/meditations/:id', async (req, res) => {
  try {
    const doc = await Meditation.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const audioRel = extractRelative(doc.audioUrl, 'meditations', 'audio');
    if (audioRel) fs.unlink(audioRel, () => {});
    const thumbRel = extractRelative(doc.thumbnailUrl, 'meditations', 'thumbs');
    if (thumbRel) fs.unlink(thumbRel, () => {});

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// SOUND ROUTES
// ============================================================

app.get('/api/sounds', async (req, res) => {
  try {
    const query = {};
    if (req.query.published === 'true') query.isPublished = true;
    if (req.query.active === 'true') query.isActive = true;
    const list = await Sound.find(query).sort({ sortOrder: 1, createdAt: -1 });
    res.json({ items: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sounds/:id', async (req, res) => {
  try {
    const doc = await Sound.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/sounds', soundUpload, uploadFields, async (req, res) => {
  try {
    const audioFile = req.files?.audio?.[0];
    if (!audioFile) return res.status(400).json({ error: 'Audio required' });

    const thumbFile = req.files?.thumbnail?.[0];
    const tags = req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    const doc = await Sound.create({
      title: req.body.title || 'Untitled',
      description: req.body.description || '',
      category: req.body.category || 'Ambient',
      tags,
      audioUrl: buildFileUrl(req, audioFile.path),
      thumbnailUrl: thumbFile ? buildFileUrl(req, thumbFile.path) : '',
      durationSeconds: parseInt(req.body.durationSeconds || '0', 10),
      fileSize: audioFile.size,
      sortOrder: parseInt(req.body.sortOrder || '0', 10),
      isPublished: req.body.isPublished !== 'false',
      isFeatured: req.body.isFeatured === 'true',
      isActive: req.body.isActive !== 'false'
    });
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/sounds/:id', soundUpload, uploadFields, async (req, res) => {
  try {
    const doc = await Sound.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const audioFile = req.files?.audio?.[0];
    if (audioFile) {
      const oldRel = extractRelative(doc.audioUrl, 'sounds', 'audio');
      if (oldRel) fs.unlink(oldRel, () => {});
      doc.audioUrl = buildFileUrl(req, audioFile.path);
      doc.fileSize = audioFile.size;
    }
    const thumbFile = req.files?.thumbnail?.[0];
    if (thumbFile) {
      const oldRel = extractRelative(doc.thumbnailUrl, 'sounds', 'thumbs');
      if (oldRel) fs.unlink(oldRel, () => {});
      doc.thumbnailUrl = buildFileUrl(req, thumbFile.path);
    }

    if (req.body.title !== undefined) doc.title = req.body.title;
    if (req.body.description !== undefined) doc.description = req.body.description;
    if (req.body.category !== undefined) doc.category = req.body.category;
    if (req.body.tags !== undefined) doc.tags = req.body.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (req.body.durationSeconds !== undefined) doc.durationSeconds = parseInt(req.body.durationSeconds, 10);
    if (req.body.sortOrder !== undefined) doc.sortOrder = parseInt(req.body.sortOrder, 10);
    if (req.body.isPublished !== undefined) doc.isPublished = req.body.isPublished === 'true';
    if (req.body.isFeatured !== undefined) doc.isFeatured = req.body.isFeatured === 'true';
    if (req.body.isActive !== undefined) doc.isActive = req.body.isActive === 'true';
    doc.updatedAt = new Date();

    await doc.save();
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/sounds/:id', async (req, res) => {
  try {
    const doc = await Sound.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const audioRel = extractRelative(doc.audioUrl, 'sounds', 'audio');
    if (audioRel) fs.unlink(audioRel, () => {});
    const thumbRel = extractRelative(doc.thumbnailUrl, 'sounds', 'thumbs');
    if (thumbRel) fs.unlink(thumbRel, () => {});

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'serene-backend', version: '2.0' });
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serene backend v2 running on port ${PORT}`);
});
