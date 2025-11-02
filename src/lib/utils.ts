import config from '../config';
import { ioRedisServer } from '../servers/ioredis-server';
import { MediaNodeData } from '../types';
import { Actions } from '../types/actions';

export const HEARTBEAT_TIMEOUT = 60000; // 90 seconds / 1.30mins
export const MEDIANODE_TTL = 300000; // 180seconds 3mins

export const getRedisKey = {
  room: (roomId: string): string => `room:${roomId}`,
  lobby: (roomId: string): string => `lobby:${roomId}`,
  roomPeers: (roomId: string): string => `room:${roomId}:peers`,
  roomPeerIds: (roomId: string): string => `room:${roomId}:peerids`,
  roomActiveSpeakerPeerId: (roomId: string): string =>
    `room:${roomId}:activespeakerpeerid`,
  rooms: (): string => `rooms`,
  medianodes: (): string => `medianodes`, // todo delete
  medianode: (nodeId: string): string => `medianodes:${nodeId}`,
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
      grpcPort: `${config.grpcPort}`,
    };
    // todo  remove data from redis if it matches this node id

    // await redisServer.sAdd(
    //   {etRedisKey['medianodes'](),
    //   JSON.stringify(medianodeData)
    // );

    // register medianode in redis hash for easy lookup
    await ioRedisServer.hSet(getRedisKey['medianode'](medianodeData.id), {
      ...medianodeData,
    });

    // set ttl for medianode
    await ioRedisServer.expire(
      getRedisKey['medianode'](medianodeData.id),
      MEDIANODE_TTL / 1000
    );
    // publish update to notify other services
    await ioRedisServer.publish({
      channel: Actions.Message,
      action: Actions.MediaNodeAdded,
      args: { ...medianodeData },
    });
    return medianodeData;
  } catch (error) {
    throw error;
  }
};

export const handleHeartBeat = async (): Promise<void> => {
  ioRedisServer
    .expire(getRedisKey['medianode'](config.nodeId), MEDIANODE_TTL / 1000)
    .catch(error => console.log(error));
  console.log('handleHeartBeat');
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
