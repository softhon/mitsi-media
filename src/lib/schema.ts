import z from 'zod';

const roomIdPeerIdSchema = z.object({
  roomId: z.string(),
  peerId: z.string(),
});

export const ValidationSchema = {
  roomIdPeerId: roomIdPeerIdSchema,
  createPeer: z.object({
    peerId: z.string(),
    roomId: z.string(),
    rtpCapabilities: z.any(),
    peerType: z.enum(['Participant', 'Recorder']),
  }),

  connectWebRtcTransport: z.object({
    ...roomIdPeerIdSchema,
    transportId: z.string(),
    dtlsParameters: z.any(),
  }),
};
