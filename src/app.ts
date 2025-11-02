import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'https';

import config from './config';
import { Routes } from './routes';
import { grpcServer } from './servers/grpc-server';
import { getRedisKey, handleHeartBeat, registerMediaNode } from './lib/utils';
import { mediaSoupServer } from './servers/mediasoup-server';
import { Actions } from './types/actions';
import { ioRedisServer } from './servers/ioredis-server';

const app = express();
app.use(cors(config.cors));
app.use(helmet());
app.use(express.json());
app.use('/', Routes);

const httpsServer = createServer(config.httpsServerOptions, app);

// let medianodeData: MediaNodeData;
let heartBeatInterval: NodeJS.Timeout;

(async (): Promise<void> => {
  try {
    await ioRedisServer.connect();
    httpsServer.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
    await grpcServer.start();

    await mediaSoupServer.start();

    await registerMediaNode();

    heartBeatInterval = setInterval(handleHeartBeat, 120000);

    console.log('Register medianode');
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
})();

const shutdown = async (): Promise<void> => {
  try {
    await ioRedisServer.publish({
      channel: Actions.Message,
      action: Actions.MediaNodeRemoved,
      args: { id: config.nodeId },
    });

    await ioRedisServer.del(getRedisKey['medianode'](config.nodeId));

    console.log('Delete medianode');
    httpsServer.close();
    mediaSoupServer.shutdown();
    await ioRedisServer.disconnect();

    clearInterval(heartBeatInterval);
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

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  shutdown();
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown();
});
