import fs from 'fs';
import os from 'os';
import path from 'path';

import * as dotenv from 'dotenv';
import { types as mediasoupTypes } from 'mediasoup';

dotenv.config();

const certFile =
  process.env.HTTPS_CERT ||
  path.join(__dirname, '..', 'certs', 'fullchain.pem');
const keyFile =
  process.env.HTTPS_KEY || path.join(__dirname, '..', 'certs', 'privkey.pem');

const config = {
  env: process.env.NODE_ENV,
  cors: {
    origin: process.env.NODE_ENV === 'production' ? ['https://mitsi.app'] : '*',
    methods: ['GET', 'POST'],
  },
  httpsServerOptions: {
    key: fs.readFileSync(keyFile, 'utf8'),
    cert: fs.readFileSync(certFile, 'utf8'),
  },
  port: process.env.PORT || 4000,
  cpus: Object.keys(os.cpus()).length,

  apiServerUrl: process.env.API_SERVER_URL,
  apiServerApiKey: process.env.API_SERVER_API_KEY,
  recordingServerUrl: process.env.RECORDING_SERVER_URL,
  redisServerUrl: process.env.REDIS_SERVER_URL || 'redis://localhost:6379',

  mediasoup: {
    workerSettings: {
      dtlsCertificateFile: certFile,
      dtlsPrivateKeyFile: keyFile,
      rtcMinPort: parseInt(process.env.RTC_MIN_PORT || '2000'),
      rtcMaxPort: parseInt(process.env.RTC_MAX_PORT || '2300'),
      logLevel: 'warn' as mediasoupTypes.WorkerLogLevel,
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
        'rtx',
        'bwe',
        'score',
        'simulcast',
        'svc',
        'sctp',
      ] as Array<mediasoupTypes.WorkerLogTag>,
    },
    routerMediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        // parameters: {
        //     'stereo': 1,
        //     'sprop-stereo': 1,
        //     'maxplaybackrate': 48000,
        //     'useinbandfec': 1
        // }
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      // {
      //     kind: 'video',
      //     mimeType: 'video/VP9',
      //     clockRate: 90000,
      //     parameters: {
      //         'profile-id': 2,
      //         'x-google-start-bitrate': 1000
      //     }
      // },
      // {
      //     kind: 'video',
      //     mimeType: 'video/h264',
      //     clockRate: 90000,
      //     parameters: {
      //         'packetization-mode': 1,
      //         'profile-level-id': '4d0032',
      //         'level-asymmetry-allowed': 1,
      //         'x-google-start-bitrate': 1000
      //     }
      // },
      // {
      //     kind: 'video',
      //     mimeType: 'video/h264',
      //     clockRate: 90000,
      //     parameters: {
      //         'packetization-mode': 1,
      //         'profile-level-id': '42e01f',
      //         'level-asymmetry-allowed': 1,
      //         'x-google-start-bitrate': 1000
      //     }
      // }
    ] as Array<mediasoupTypes.RtpCodecCapability>,
  },
};

export default config;
