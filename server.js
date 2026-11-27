require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql2/promise');
const createOrdersRouter = require('./orders');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- uploads folder ----------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

const EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      // extension comes from the mimetype, never from the user's file name
      const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[file.mimetype]}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 }, // 5 MB per file, 10 files per request
  fileFilter: (req, file, cb) => {
    if (EXT[file.mimetype]) return cb(null, true);
    const err = new Error('Only JPG, PNG, WEBP or GIF images are allowed');
    err.status = 400;
    cb(err);
  },
});

// "/uploads/abc.jpg" -> delete that file. Ignores anything outside /uploads and missing files.
async function deleteImage(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
  const file = path.join(UPLOAD_DIR, path.basename(imageUrl));
  try {
    await fs.promises.unlink(file);
  } catch (e) {
    if (e.code !== 'ENOENT')
      console.error('Could not delete image:', e.message);
  }
}

// ---------- database ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false },
});

// ---------- helpers ----------
// Protects write routes. Set ADMIN_TOKEN in .env and send: Authorization: Bearer <token>
function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next(); // no token configured = open (dev only)
  const header = req.headers.authorization || '';
  if (header === `Bearer ${token}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.use('/api/orders', createOrdersRouter(pool, requireAdmin));

function validate(body, partial = false) {
  const errors = [];
  if (!partial || body.name !== undefined) {
    if (!body.name || !String(body.name).trim())
      errors.push('name is required');
  }
  if (!partial || body.price !== undefined) {
    const p = Number(body.price);
    if (
      body.price === undefined ||
      body.price === '' ||
      Number.isNaN(p) ||
      p < 0
    )
      errors.push('price must be a number >= 0');
  }
  if (!partial || body.discount !== undefined) {
    if (body.discount !== '' && body.discount != null) {
      const d = Number(body.discount);
      if (Number.isNaN(d) || d < 0)
        errors.push('discount must be a number >= 0');
    }
  }
  if (!partial || body.sizes !== undefined) {
    const sizes = parseSizes(body.sizes);
    if (sizes === null)
      errors.push(
        'sizes must be a list like 39,40,41 (max 20 sizes, each up to 10 characters)',
      );
    else if (sizes.length === 0) errors.push('at least one size is required');
  }
  return errors;
}

// Accepts "39,40,41", ["39","40"], '["39","40"]' or repeated form fields.
// Returns a clean, de-duplicated, sorted array of strings, or null if invalid.
function parseSizes(input) {
  if (input === undefined || input === null || input === '') return [];
  let list = input;
  if (typeof list === 'string') {
    const t = list.trim();
    if (t.startsWith('[')) {
      try {
        list = JSON.parse(t);
      } catch {
        return null;
      }
    } else {
      list = t.split(',');
    }
  }
  if (!Array.isArray(list)) return null;
  const out = [...new Set(list.map((s) => String(s).trim()).filter(Boolean))];
  if (out.length > 20 || out.some((s) => s.length > 10)) return null;
  return out.sort((a, b) => {
    const x = Number(a);
    const y = Number(b);
    return !Number.isNaN(x) && !Number.isNaN(y) ? x - y : a.localeCompare(b);
  });
}

function parseImageUrls(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value))
    return value.filter((url) => typeof url === 'string');
  return [];
}

function getUploadedImages(req) {
  return (req.files || []).map((file) => `/uploads/${file.filename}`);
}

async function deleteImages(imageUrls) {
  await Promise.all([...new Set(imageUrls)].map(deleteImage));
}

// Makes sure "sizes" and "images" always come back to the frontend as arrays.
function toProduct(row) {
  let sizes = row.sizes;
  if (typeof sizes === 'string') {
    try {
      sizes = JSON.parse(sizes);
    } catch {
      sizes = [];
    }
  }
  return {
    ...row,
    sizes: Array.isArray(sizes) ? sizes : [],
    images: parseImageUrls(row.images),
  };
}

// ---------- routes ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));

// List products (supports ?search= & ?size=42 & ?limit= & ?offset=)
app.get('/api/products', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const where = [];
    const params = [];
    if (req.query.search) {
      where.push('name LIKE ?');
      params.push(`%${req.query.search}%`);
    }
    if (req.query.size) {
      where.push('JSON_CONTAINS(sizes, JSON_QUOTE(?))');
      params.push(String(req.query.size));
    }
    const [rows] = await pool.query(
      `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    res.json(rows.map(toProduct));
  } catch (e) {
    next(e);
  }
});

// Get one product
app.get('/api/products/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [
      req.params.id,
    ]);
    if (!rows.length)
      return res.status(404).json({ error: 'Product not found' });
    res.json(toProduct(rows[0]));
  } catch (e) {
    next(e);
  }
});

// Create (multipart/form-data: name, price, discount, sizes, description, repeated images)
app.post(
  '/api/products',
  upload.array('images', 10),
  async (req, res, next) => {
    const newImages = getUploadedImages(req);
    let imagesSaved = false;
    try {
      const errors = validate(req.body);
      if (errors.length) {
        await deleteImages(newImages);
        return res.status(400).json({ errors });
      }
      const { name, price } = req.body;
      const discount =
        (
          req.body.discount === undefined ||
          req.body.discount === null ||
          req.body.discount === ''
        ) ?
          null
        : req.body.discount;
      const description = req.body.description || null;
      const sizes = parseSizes(req.body.sizes);
      const [result] = await pool.query(
        'INSERT INTO products (name, description, price, discount, sizes, images) VALUES (?, ?, ?, ?, ?, ?)',
        [
          String(name).trim(),
          description,
          price,
          discount,
          JSON.stringify(sizes),
          JSON.stringify(newImages),
        ],
      );
      imagesSaved = true;
      const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [
        result.insertId,
      ]);
      res.status(201).json(toProduct(rows[0]));
    } catch (e) {
      if (!imagesSaved) await deleteImages(newImages); // do not leave orphan files if the insert failed
      next(e);
    }
  },
);

// Update (multipart/form-data; send only the fields to change)
// New "images" files replace the old ones. Send remove_images=true to clear them.
app.put(
  '/api/products/:id',
  upload.array('images', 10),
  async (req, res, next) => {
    const newImages = getUploadedImages(req);
    let imagesSaved = false;
    try {
      const id = Number(req.params.id);
      const errors = validate(req.body, true);
      if (errors.length) {
        await deleteImages(newImages);
        return res.status(400).json({ errors });
      }
      const [existing] = await pool.query(
        'SELECT * FROM products WHERE id = ?',
        [id],
      );
      if (!existing.length) {
        await deleteImages(newImages);
        return res.status(404).json({ error: 'Product not found' });
      }

      const cur = existing[0];
      const oldImages = parseImageUrls(cur.images);
      let images = oldImages;
      if (newImages.length) images = newImages;
      else if (req.body.remove_images === 'true') images = [];

      const sizes =
        req.body.sizes !== undefined ?
          parseSizes(req.body.sizes)
        : toProduct(cur).sizes;
      const discount =
        req.body.discount === undefined ? cur.discount
        : req.body.discount === null || req.body.discount === '' ? null
        : req.body.discount;

      await pool.query(
        'UPDATE products SET name=?, description=?, price=?, discount=?, sizes=?, images=? WHERE id=?',
        [
          req.body.name !== undefined ? String(req.body.name).trim() : cur.name,
          req.body.description !== undefined ?
            req.body.description || null
          : cur.description,
          req.body.price !== undefined ? req.body.price : cur.price,
          discount,
          JSON.stringify(sizes),
          JSON.stringify(images),
          id,
        ],
      );
      imagesSaved = true;

      // DB updated successfully, now it is safe to remove the old files.
      if (images !== oldImages) await deleteImages(oldImages);

      const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [
        id,
      ]);
      res.json(toProduct(rows[0]));
    } catch (e) {
      if (!imagesSaved) await deleteImages(newImages);
      next(e);
    }
  },
);

// Delete product + its image file
app.delete('/api/products/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT images FROM products WHERE id = ?',
      [req.params.id],
    );
    if (!rows.length)
      return res.status(404).json({ error: 'Product not found' });
    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    await deleteImages(parseImageUrls(rows[0].images));
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

// ---------- errors ----------
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE' ?
        'Image must be 5 MB or smaller'
      : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err.status === 400) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
