const express = require('express');

const ORDER_STATUSES = ['pending', 'declined', 'confirmed'];

function createOrdersRouter(pool, requireAdmin, emailService) {
  const router = express.Router();

  router.post('/', async (req, res, next) => {
    try {
      const body =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body) ?
          req.body
        : {};
      const { name, email, phone, delivery_address: deliveryAddress } = body;
      const productId = Number(body.product_id);
      const quantityText =
        typeof body.quantity === 'number' || typeof body.quantity === 'string' ?
          String(body.quantity).trim()
        : '';
      const quantity = Number(quantityText);
      const totalPriceText =
        typeof body.total_price === 'number' ||
        typeof body.total_price === 'string' ?
          String(body.total_price).trim()
        : '';
      const totalPrice = Number(totalPriceText);
      const errors = [];

      if (typeof name !== 'string' || !name.trim() || name.trim().length > 150)
        errors.push('name is required and must be 150 characters or fewer');
      if (
        typeof email !== 'string' ||
        email.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      )
        errors.push('email must be valid');
      if (
        typeof phone !== 'string' ||
        !phone.trim() ||
        phone.trim().length > 30
      )
        errors.push('phone is required and must be 30 characters or fewer');
      if (typeof deliveryAddress !== 'string' || !deliveryAddress.trim())
        errors.push('delivery_address is required');
      if (!Number.isSafeInteger(productId) || productId <= 0)
        errors.push('product_id must be a positive integer');
      if (
        !/^\d+$/.test(quantityText) ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        quantity > 4294967295
      )
        errors.push('quantity must be a positive integer');
      if (
        !/^\d{1,8}(?:\.\d{1,2})?$/.test(totalPriceText) ||
        !Number.isFinite(totalPrice) ||
        totalPrice > 99999999.99
      )
        errors.push(
          'total_price must be a number from 0 to 99999999.99 with up to 2 decimal places',
        );

      if (errors.length) return res.status(400).json({ errors });

      const [products] = await pool.query(
        'SELECT id, name FROM products WHERE id = ?',
        [productId],
      );
      if (!products.length)
        return res.status(400).json({ error: 'Product not found' });
      if (!emailService.isConfigured)
        return res.status(503).json({
          error: 'Order email notifications are not configured',
        });

      const [result] = await pool.query(
        'INSERT INTO orders (product_id, quantity, total_price, name, email, phone, delivery_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          productId,
          quantity,
          totalPrice.toFixed(2),
          name.trim(),
          email.trim(),
          phone.trim(),
          deliveryAddress.trim(),
        ],
      );
      const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [
        result.insertId,
      ]);
      const order = { ...orders[0], product_name: products[0].name };
      try {
        await emailService.sendNewOrderEmails(order);
      } catch (error) {
        console.error('Failed to send order creation emails:', error);
        return res.status(502).json({
          error: 'Order was created, but one or more notification emails failed',
          order,
        });
      }
      res.status(201).json(order);
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const [orders] = await pool.query(
        `SELECT orders.*,
                products.name AS product_name,
                JSON_UNQUOTE(JSON_EXTRACT(products.images, '$[0]')) AS product_image
         FROM orders
         INNER JOIN products ON products.id = orders.product_id
         ORDER BY orders.id DESC`,
      );
      res.json(orders);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id/status', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const status = req.body && req.body.status;

      if (!Number.isSafeInteger(id) || id <= 0)
        return res
          .status(400)
          .json({ error: 'Order ID must be a positive integer' });
      if (!ORDER_STATUSES.includes(status))
        return res.status(400).json({
          error: `status must be one of: ${ORDER_STATUSES.join(', ')}`,
        });

      const [existing] = await pool.query(
        'SELECT * FROM orders WHERE id = ?',
        [id],
      );
      if (!existing.length)
        return res.status(404).json({ error: 'Order not found' });
      const previousStatus = existing[0].status;
      if (previousStatus !== status && !emailService.isConfigured)
        return res.status(503).json({
          error: 'Order status email notifications are not configured',
        });

      await pool.query('UPDATE orders SET status = ? WHERE id = ?', [
        status,
        id,
      ]);

      const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [
        id,
      ]);
      if (previousStatus !== status) {
        try {
          await emailService.sendOrderStatusEmail(orders[0]);
        } catch (error) {
          console.error('Failed to send order status email:', error);
          return res.status(502).json({
            error: 'Order status was updated, but the notification email failed',
            order: orders[0],
          });
        }
      }
      res.json(orders[0]);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createOrdersRouter;
