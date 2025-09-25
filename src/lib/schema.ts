import z from 'zod';

const roomIdPeerIdSchema = z.object({
  roomId: z.string(),
  peerId: z.string(),
});

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
    kind: z.enum(['audio', 'video']),
    appData: z.any(),
  }),

  manageProducer: roomIdPeerIdSchema.extend({
    producerId: z.string(),
    source: z.enum(['mic', 'camera', 'screen']),
  }),

  restartIce: roomIdPeerIdSchema.extend({
    transportId: z.string(),
  }),
};
