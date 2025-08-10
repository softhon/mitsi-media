import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const certPath = path.join(__dirname, '..', 'certs', 'fullchain.pem');
const keyPath = path.join(__dirname, '..', 'certs', 'privkey.pem');

const config = {
  env: process.env.NODE_ENV,
  cors: {
    origin: process.env.NODE_ENV === 'production' ? ['https://mitsi.app'] : '*',
    methods: ['GET', 'POST'],
  },
  tls: {
    cert: process.env.HTTPS_CERT || certPath,
    key: process.env.HTTPS_KEY || keyPath,
  },
  port: process.env.PORT || 8000,
  apiServerUrl: process.env.API_SERVER_URL,
  apiServerApiKey: process.env.API_SERVER_API_KEY,
  recordingServerUrl: process.env.RECORDING_SERVER_URL,
  redisServerUrl: process.env.REDIS_SERVER_URL || 'redis://localhost:6379',
};

export default config;
