import z from 'zod';

const roomIdPeerIdSchema = z.object({
  roomId: z.string(),
  peerId: z.string(),
});

const producerSource = z.enum(['mic', 'camera', 'screen', 'screenAudio']);
const mediaKind = z.enum(['audio', 'video']);

export const ValidationSchema = {
  roomIdPeerId: roomIdPeerIdSchema,
  createPeer: roomIdPeerIdSchema.extend({
    deviceRtpCapabilities: z
      .any()
      .refine(value => value, 'Can not be null or undefined'),
    peerType: z.enum(['Participant', 'Recorder']),
  }),

  connectWebRtcTransport: roomIdPeerIdSchema.extend({
    transportId: z.string(),
    dtlsParameters: z
      .any()
      .refine(value => value, 'Can not be null or undefined'),
  }),

  createProducer: roomIdPeerIdSchema.extend({
    rtpParameters: z
      .any()
      .refine(value => value, 'Can not be null or undefined'),
    transportId: z.string(),
    kind: mediaKind,
    appData: z.any(),
  }),

  manageProducer: roomIdPeerIdSchema.extend({
    producerId: z.string(),
    source: producerSource,
  }),

  restartIce: roomIdPeerIdSchema.extend({
    transportId: z.string(),
  }),
};
