import z from 'zod';

const roomIdPeerIdSchema = z.object({
  roomId: z.string(),
  peerId: z.string(),
});

export const ValidationSchema = {
  roomIdPeerId: roomIdPeerIdSchema,
  createPeer: roomIdPeerIdSchema.extend({
    rtpCapabilities: z.any(),
    peerType: z.enum(['Participant', 'Recorder']),
  }),

  connectWebRtcTransport: roomIdPeerIdSchema.extend({
    transportId: z.string(),
    dtlsParameters: z.any(),
  }),

  createProducer: roomIdPeerIdSchema.extend({
    rtpParameters: z.any(),
    transportId: z.string(),
    kind: z.enum(['audio', 'video']),
    appData: z.any(),
  }),

  manageProducer: roomIdPeerIdSchema.extend({
    producerId: z.string(),
    source: z.enum(['mic', 'camera', 'screen']),
  }),
};
