import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'https';

import config from './config';
import { Routes } from './routes';
import { redisServer } from './servers/redis-server';
import { grpcServer } from './servers/grpc-server';

const app = express();
app.use(cors(config.cors));
app.use(helmet());
app.use(express.json());
app.use('/', Routes);

const httpsServer = createServer(config.httpsServerOptions, app);

(async (): Promise<void> => {
  try {
    await redisServer.connect();
    httpsServer.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
    await grpcServer.start();
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
})();

const shutdown = async (): Promise<void> => {
  try {
    await redisServer.disconnect();
    httpsServer.close();
    console.log('Application shut down gracefully');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
