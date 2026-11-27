const nodemailer = require('nodemailer');

function formatOrderDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ?
      String(value || 'Unknown')
    : date.toISOString();
}

function createOrderEmailService() {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const password = process.env.SMTP_PASS || '';
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const secureSetting = process.env.SMTP_SECURE;
  const secure =
    secureSetting === undefined ? port === 465 : secureSetting === 'true';
  const isConfigured =
    Boolean(host && user && password && adminEmail) &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535 &&
    (secureSetting === undefined ||
      secureSetting === 'true' ||
      secureSetting === 'false');

  const transporter =
    isConfigured ?
      nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: !secure,
        auth: { user, pass: password },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      })
    : null;

  async function sendAll(messages) {
    if (!transporter) throw new Error('SMTP email settings are missing or invalid');
    const results = await Promise.allSettled(
      messages.map((message) => transporter.sendMail(message)),
    );
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      const error = new Error(
        `Failed to send ${failures.length} of ${messages.length} order notification emails`,
      );
      error.causes = failures.map((failure) => failure.reason);
      throw error;
    }
  }

  return {
    isConfigured,

    async sendTestEmail() {
      if (!transporter) throw new Error('SMTP email settings are missing or invalid');
      await transporter.verify();
      await transporter.sendMail({
        from: user,
        to: adminEmail,
        subject: 'Velaroqa SMTP email test',
        text: 'SMTP email delivery is configured correctly.',
      });
    },

    async sendNewOrderEmails(order) {
      const orderDate = formatOrderDate(order.created_at);
      const customerMessage = {
        from: user,
        to: order.email,
        subject: `We received your order #${order.id}`,
        text: [
          `Hi ${order.name},`,
          '',
          `We received your order #${order.id}. Its current status is pending.`,
          'We will email you as soon as there is an update.',
          '',
          `Product: ${order.product_name}`,
          `Quantity: ${order.quantity}`,
          `Total price: ${order.total_price}`,
          `Order date: ${orderDate}`,
        ].join('\n'),
      };
      const adminMessage = {
        from: user,
        to: adminEmail,
        subject: `New order #${order.id}`,
        text: [
          `A new order (#${order.id}) has been received.`,
          '',
          `Order date: ${orderDate}`,
          `Product: ${order.product_name} (ID: ${order.product_id})`,
          `Quantity: ${order.quantity}`,
          `Total price: ${order.total_price}`,
          `Customer name: ${order.name}`,
          `Customer email: ${order.email}`,
          `Customer phone: ${order.phone}`,
          `Delivery address: ${order.delivery_address}`,
          `Status: ${order.status}`,
        ].join('\n'),
      };

      await sendAll([customerMessage, adminMessage]);
    },

    async sendOrderStatusEmail(order) {
      await sendAll([
        {
          from: user,
          to: order.email,
          subject: `Your order #${order.id} is ${order.status}`,
          text: [
            `Hi ${order.name},`,
            '',
            `The status of your order #${order.id} has been updated to: ${order.status}.`,
            '',
            `Product: ${order.product_name}`,
            `Quantity: ${order.quantity}`,
            `Total price: ${order.total_price}`,
            `Order date: ${formatOrderDate(order.created_at)}`,
          ].join('\n'),
        },
      ]);
    },
  };
}

module.exports = createOrderEmailService;
