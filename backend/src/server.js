const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const app = require('./app');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');
const attachTelemedicineSocket = require('./services/telemedicineSocket');
const notifications = require('./services/notificationService');
const { allowedOrigins, assertProductionEnvironment } = require('./config/security');

assertProductionEnvironment();

const port = Number(process.env.PORT) || 5000;
const server = http.createServer(app);
const origins = allowedOrigins();
const io = new Server(server, { cors: { origin: origins, credentials: true }, maxHttpBufferSize: 1e6 });
attachTelemedicineSocket(io);
notifications.attachRealtime(io);
const listen = () => server.listen(port, () => console.log(`API listening on port ${port}`));
connectDB().then(() => { notifications.startReminderScheduler(); listen(); }).catch((error) => {
  console.error(`MongoDB unavailable: ${error.name || 'connection error'}`);
  if (process.env.NODE_ENV === 'production') process.exit(1);
  console.error('The development API will start without database access; check MONGODB_URI and restart it.');
  listen();
});

function shutdown() {
  io.close(() => server.close(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
