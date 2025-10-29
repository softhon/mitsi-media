import { types as mediasoupTypes } from 'mediasoup';
import { EventEmitter } from 'events';
import Peer from './peer';
import config from '../config';
import { mediaSoupServer } from '../servers/mediasoup-server';
import { ioRedisServer } from '../servers/ioredis-server';
import { getRedisKey } from '../lib/utils';
import { Actions } from '../types/actions';
import MediaNode from './medianode';
import { AppDataWithRouterId } from '../types';

class Room extends EventEmitter {
  roomId: string;

  activeSpeaker: {
    peerId: string | null;
    timestamp: number;
  };
  closed: boolean;
  // peers

  private peers: Map<string, Peer>;

  //media nodes
  mediaNodes: Map<string, MediaNode>;
  // mediasoup details
  // workers: Map<number, mediasoupTypes.Worker>;
  routers: Map<string, mediasoupTypes.Router>;
  audioLevelObservers: Map<string, mediasoupTypes.AudioLevelObserver>;
  // all meets in the server
  private static rooms = new Map<string, Room>();

  constructor({
    roomId,
    routers,
    audioLevelObservers,
  }: {
    roomId: string;
    routers: Map<string, mediasoupTypes.Router>;
    audioLevelObservers: Map<string, mediasoupTypes.AudioLevelObserver>;
  }) {
    super();
    this.roomId = roomId;

    this.peers = new Map();
    this.mediaNodes = new Map();

    this.closed = false;
    this.routers = routers;
    this.audioLevelObservers = audioLevelObservers;
    this.activeSpeaker = {
      peerId: null,
      timestamp: 0,
    };

    this.handleAudioLevelObserver();
    // this.handleEvents()

    Room.addRoom(this.roomId, this);
  }

  close(): void {
    // console.log('Closing room')
    if (this.closed) return;

    for (const peer of this.getPeers()) {
      peer.close();
    }

    // close routerss
    for (const router of this.routers.values()) {
      this.audioLevelObservers.delete(router.id);
      router.close();
    }

    this.audioLevelObservers.clear();
    this.routers.clear();
    this.peers.clear();

    Room.rooms.delete(this.roomId);

    // this.emit(SERVICE_EVENTS.close);

    this.removeAllListeners();

    console.info(`Meeting - ${this.roomId} CLOSED`);
  }

  static async create(roomId: string): Promise<Room> {
    try {
      const routers: Map<string, mediasoupTypes.Router> = new Map();
      const audioLevelObservers: Map<
        string,
        mediasoupTypes.AudioLevelObserver
      > = new Map();

      for (const workerInfo of mediaSoupServer.getHealthyWorkers()) {
        const router = await workerInfo.worker.createRouter({
          mediaCodecs: config.mediasoup.routerMediaCodecs,
        });
        routers.set(router.id, router);

        const audioLevelObserver = await router.createAudioLevelObserver({
          maxEntries: 1,
          threshold: -80,
          interval: 1800,
          appData: {
            peerId: null,
            volume: -1000,
          },
        });

        audioLevelObservers.set(router.id, audioLevelObserver);
      }

      const room = new Room({ roomId, routers, audioLevelObservers });

      // publish mediaNodeJoinMeeting
      // redisServer.publish

      return room;
    } catch (error) {
      console.error('create meeting failed', error);
      throw error;
    }
  }

  static addRoom(roomId: string, room: Room): void {
    Room.rooms.set(roomId, room);
  }

  static getRoom(roomId: string): Room | undefined {
    return Room.rooms.get(roomId);
  }

  static removeRoom(roomId: string): void {
    Room.rooms.delete(roomId);
  }

  // peers
  addPeer(peer: Peer): void {
    this.peers.set(peer.id, peer);
    // this.emit(SERVICE_EVENTS.peerAdded, peer);
    this.handlePeerEvents(peer);
  }

  getPeer(id: string): Peer | undefined {
    return this.peers.get(id);
  }

  getPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  removePeer(id: string): void {
    // const peer = this.peers.get(id);
    this.peers.delete(id);

    // if (peer) this.emit(SERVICE_EVENTS.peerRemoved, peer);
  }

  getRouters(): mediasoupTypes.Router[] {
    return Array.from(this.routers.values());
  }

  getRouterRtpCapabilities(): mediasoupTypes.RtpCapabilities {
    return Array.from(this.routers.values())[0].rtpCapabilities;
  }

  async assignRouterToPeer(): Promise<mediasoupTypes.Router | null> {
    const router = this.getLeastLoadedRouter();
    if (router) {
      await this.pipeProducersToRouter(router);
      return router;
    }
    return null;
  }

  getRoutersToPipeTo(
    originRouter: mediasoupTypes.Router
  ): mediasoupTypes.Router[] {
    return Array.from(this.routers.values()).filter(
      router => router.id !== originRouter.id
    );
  }

  getLeastLoadedRouter(): mediasoupTypes.Router | null {
    // the least loaded router,
    // is the room router of the least loaded worker

    const leastLoadedWorker = mediaSoupServer.getLeastLoadedWorker();

    if (!leastLoadedWorker) throw 'Least Loaded Worker not found';

    for (const routerId of (
      leastLoadedWorker.appData.routers as Map<string, mediasoupTypes.Router>
    ).keys()) {
      const router = this.routers.get(routerId);
      if (router) {
        return router;
      }
    }

    return null;
  }

  private async pipeProducersToRouter(
    router: mediasoupTypes.Router
  ): Promise<void> {
    try {
      const peersToPipe = Array.from(this.peers.values()).filter(
        peer => peer.getRouter().id !== router.id
      );
      for (const peer of peersToPipe) {
        const srcRouter = peer.getRouter();
        if (srcRouter) {
          for (const producer of peer.getProducers()) {
            if (
              (
                router.appData.producers as Map<string, mediasoupTypes.Producer>
              ).has(producer.id)
            ) {
              continue;
            }
            await srcRouter.pipeToRouter({
              producerId: producer.id,
              router,
            });
          }
        }
      }
    } catch (error) {
      console.error('pipeProducersToRouter', error);
    }
  }

  private handleAudioLevelObserver(): void {
    this.audioLevelObservers.forEach(audioLevelObserver => {
      audioLevelObserver.on('volumes', volumes => {
        const { producer, volume } = volumes[0];

        audioLevelObserver.appData = {
          ...audioLevelObserver.appData,
          peerId: producer.appData.peerId,
          volume: volume,
          // speakerIds
        };
        this.broadcastActiveSpeakerInfo();
      });

      audioLevelObserver.on('silence', () => {
        audioLevelObserver.appData = {
          ...audioLevelObserver.appData,
          peerId: null,
          volume: -1000,
          // speakerIds: []
        };

        this.broadcastActiveSpeakerInfo();
      });
    });
  }

  private broadcastActiveSpeakerInfo = (): void => {
    let peerId = null;
    let maxVolume = -1000;
    const speakerIds: string[] = [];

    this.audioLevelObservers.forEach(audioLevelObserver => {
      const tmpPeerId = audioLevelObserver.appData.peerId as string;
      const tmpVolume = audioLevelObserver.appData.volume as number;
      if (tmpPeerId) {
        if (tmpVolume > maxVolume) {
          peerId = tmpPeerId;
          maxVolume = tmpVolume;
        }
        speakerIds.push(tmpPeerId);
      }
    });

    if (this.activeSpeaker.peerId === peerId) return;
    // this ensures that the minimun gap between the previous and the current
    // active speaker is 1 second
    if (Date.now() > this.activeSpeaker.timestamp + 2000) {
      this.activeSpeaker = {
        peerId,
        timestamp: Date.now(),
      };

      // store meeting active speaker peerid in db.
      // todo may require a different position when optimising for multiple media servers]
      ioRedisServer.set(
        getRedisKey['roomActiveSpeakerPeerId'](this.roomId),
        JSON.stringify(peerId)
      );

      // todo work on optimising this in future to send to once to a signal node and the signal node broadcast to all peers
      // there is an edge case this implemenation is not working for.
      // it is not broadcasting for peers in other servers.
      for (const peer of this.peers.values()) {
        if (peer.id === peerId) continue;
        // Todo optimise
        // peer.signalNode.sendMessage(SIGNALLING_EVENTS.activeSpeaker, {
        //   peerId: peer.id,
        //   peerType: peer.type,
        //   roomId: this.meetingId,
        //   volume: maxVolume,
        //   speakerIds,
        //   activeSpeakerPeerId: peerId,
        // });
      }
    }
  };

  private handlePeerEvents(peer: Peer): void {
    peer.on(Actions.Close, () => {
      if (!this.getPeer(peer.id)) return;
      this.removePeer(peer.id);
    });
  }

  async createPipeTransport({
    router,
  }: {
    router: mediasoupTypes.Router;
  }): Promise<mediasoupTypes.PipeTransport<AppDataWithRouterId>> {
    const pipeTransport = await router.createPipeTransport({
      listenInfo: config.mediasoup.transportListenInfo,
      enableSctp: true,
      numSctpStreams: { OS: 1024, MIS: 1024 },
      enableRtx: false,
      enableSrtp: false,
      appData: {
        routerId: router.id,
      },
    });
    return pipeTransport;
  }

  async createPipeConsumersForExistingProducers({
    consumingMediaNode,
  }: {
    consumingMediaNode: MediaNode;
  }): Promise<void> {
    const peers = this.getPeers();
    for (const peer of peers) {
      const peerProducers = peer.getProducers().values();
      for (const producer of peerProducers) {
        this.createPipeConsumer({
          producer,
          producerPeerId: peer.id,
          consumingMediaNode,
        });
      }
    }
  }

  async createPipeConsumer({
    producer,
    producerPeerId,
    consumingMediaNode,
  }: {
    producer: mediasoupTypes.Producer;
    producerPeerId: string;
    consumingMediaNode: MediaNode;
  }): Promise<void> {
    try {
      // const router = this.getLeastLoadedRouter();
      console.log(producer, producerPeerId, consumingMediaNode);
    } catch (error) {
      console.error(`Pipe Consumer failed ${error}`);
    }
  }

  addMediaNode(mediaNode: MediaNode): void {
    this.mediaNodes.set(mediaNode.id, mediaNode);
    mediaNode.on(Actions.Close, () => {
      this.mediaNodes.delete(mediaNode.id);
    });
  }

  getMediaNodes(): MediaNode[] {
    return Array.from(this.mediaNodes.values());
  }
}

export default Room;
