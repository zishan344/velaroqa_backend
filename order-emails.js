const nodemailer = require('nodemailer');

function formatOrderDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ?
      String(value || 'Unknown')
    : date.toISOString();
}

function createOrderEmailService() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const adminEmail = process.env.ADMIN_EMAIL;
  const from = process.env.MAIL_FROM || user;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true';
  const isConfigured =
    Boolean(host && user && password && adminEmail && from) &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535;

  const transporter =
    isConfigured ?
      nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass: password },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      })
    : null;

  async function sendAll(messages) {
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

    async sendNewOrderEmails(order) {
      const orderDate = formatOrderDate(order.created_at);
      const customerMessage = {
        from,
        to: order.email,
        subject: `We received your order #${order.id}`,
        text: [
          `Hi ${order.name},`,
          '',
          `We received your order #${order.id}. Its current status is pending.`,
          'We will email you as soon as there is an update.',
          '',
          `Quantity: ${order.quantity}`,
          `Total price: ${order.total_price}`,
          `Order date: ${orderDate}`,
        ].join('\n'),
      };
      const adminMessage = {
        from,
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
          from,
          to: order.email,
          subject: `Your order #${order.id} is ${order.status}`,
          text: [
            `Hi ${order.name},`,
            '',
            `The status of your order #${order.id} has been updated to: ${order.status}.`,
            '',
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
