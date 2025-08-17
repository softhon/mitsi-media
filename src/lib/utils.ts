import config from '../config';
import { redisServer } from '../servers/redis-server';
import { MediaNodeData } from '../types';

export const getRedisKey = {
  room: (roomId: string): string => `room-${roomId}`,
  lobby: (roomId: string): string => `lobby-${roomId}`,
  roomPeers: (roomId: string): string => `room-${roomId}-peers`,
  roomPeerIds: (roomId: string): string => `room-${roomId}-peerids`,
  roomActiveSpeakerPeerId: (roomId: string): string =>
    `room-${roomId}-activespeakerpeerid`,
  roomsOngoing: (): string => `rooms-ongoing`,
  medianodesRunning: (): string => `medianodes-running`,
  signalnodesRunning: (): string => `signalnodes-running`,
  roomMedianodes: (roomId: string): string => `room-${roomId}-medianodes`,
  roomSignalnodes: (roomId: string): string => `room-${roomId}-signalnodes`,
};

export const registerMediaNode = async (): Promise<MediaNodeData> => {
  try {
    const { publicIpv4 } = await import('public-ip');
    const ip = await publicIpv4();
    const medianodeData: MediaNodeData = {
      id: ip || config.serverId,
      ip: '0.0.0.0',
      address: `${config.port}`,
      grpcPort: `${config.grpcPort}`,
    };
    await redisServer.sAdd(
      getRedisKey['medianodesRunning'](),
      JSON.stringify(medianodeData)
    );
    return medianodeData;
  } catch (error) {
    throw error;
  }
};
