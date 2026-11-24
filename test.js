// db
const pool = mysql.createPool({
  host: 'sql.freedb.tech',
  port: 3306,
  user: 'u_TwkdaY',
  password: 'UxRMVIjcKhOV',
  database: 'freedb_MVU5EQnq',
  waitForConnections: true,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false },
});
