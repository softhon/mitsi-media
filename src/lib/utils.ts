import config from '../config';
import { redisServer } from '../servers/redis-server';
import { MediaNodeData } from '../types';

export const HEARTBEAT_TIMEOUT = 60000; // 90 seconds / 1.30mins

export const getRedisKey = {
  room: (roomId: string): string => `room:${roomId}`,
  lobby: (roomId: string): string => `lobby:${roomId}`,
  roomPeers: (roomId: string): string => `room:${roomId}:peers`,
  roomPeerIds: (roomId: string): string => `room:${roomId}:peerids`,
  roomActiveSpeakerPeerId: (roomId: string): string =>
    `room:${roomId}:activespeakerpeerid`,
  rooms: (): string => `rooms`,
  medianodes: (): string => `medianodes`,
  signalnodes: (): string => `signalnodes`,
  roomMedianodes: (roomId: string): string => `room:${roomId}:medianodes`,
  roomSignalnodes: (roomId: string): string => `room:${roomId}:signalnodes`,
};

export const getPubSubChannel = {
  room: (roomId: string): string => `room-${roomId}`,
};

export const registerMediaNode = async (): Promise<MediaNodeData> => {
  try {
    // const { publicIpv4 } = await import('public-ip');
    // const ip = await publicIpv4();
    const medianodeData: MediaNodeData = {
      id: config.nodeId,
      ip: config.serverIp,
      address: `${config.serverAddress}`,
      grpcPort: `${config.grpcPort}`,
    };
    // todo  remove data from redis if it matches this node id

    await redisServer.sAdd(
      getRedisKey['medianodes'](),
      JSON.stringify(medianodeData)
    );
    return medianodeData;
  } catch (error) {
    throw error;
  }
};

export const parseArguments = (args?: string): { [key: string]: unknown } => {
  let parsedArgs: { [key: string]: unknown } = {};
  if (args) {
    try {
      parsedArgs = JSON.parse(args);
    } catch (parseError) {
      throw parseError;
    }
  }
  return parsedArgs;
};
