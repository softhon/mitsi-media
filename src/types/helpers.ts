export const getKey = {
  room: (roomId: string): string => `room-${roomId}`,
  lobby: (roomId: string): string => `lobby-${roomId}`,
  roomPeers: (roomId: string): string => `room-${roomId}-peers`,
  roomPeerIds: (roomId: string): string => `room-${roomId}-peerids`,
  roomActiveSpeakerPeerId: (roomId: string): string =>
    `room-${roomId}-active-speaker-peerid`,
};
