import { EventEmitter } from 'events';
import { types as mediasoupTypes } from 'mediasoup';
import Room from './room';
import { TransportConnectionParams } from '../types';
import config from '../config';

type AppDataWithRouterId = mediasoupTypes.AppData & { routerId: string };

class MediaNode extends EventEmitter {
  id: string;
  roomId: string;
  // map routerId to pipetransport
  sendPipeTransports: Map<
    string,
    mediasoupTypes.PipeTransport<AppDataWithRouterId>
  >;
  recvRouter: mediasoupTypes.Router;
  // map of remote sendTranportId to recvPipeTransport
  recvPipeTransports: Map<
    string,
    mediasoupTypes.PipeTransport<AppDataWithRouterId>
  >;
  producers: Map<string, mediasoupTypes.Producer>;
  consumers: Map<string, mediasoupTypes.Consumer>;

  private static MediaNodes: Map<string, MediaNode> = new Map();

  constructor({
    id,
    roomId,
    sendPipeTransports,
    recvRouter,
  }: {
    id: string;
    roomId: string;
    recvRouter: mediasoupTypes.Router;
    sendPipeTransports: Map<
      string,
      mediasoupTypes.PipeTransport<AppDataWithRouterId>
    >;
  }) {
    super();

    this.id = id;
    this.roomId = roomId;

    this.producers = new Map();
    this.consumers = new Map();
    this.recvRouter = recvRouter;
    this.sendPipeTransports = sendPipeTransports;
    this.recvPipeTransports = new Map();

    // MediaNode.MediaNodes.set(id, this)
    // consider increasing workerload systematically.
  }

  close(): void {
    this.producers.clear();
    this.consumers.clear();
    this.sendPipeTransports.clear();

    // this.emit(SERVICE_EVENTS.close);
    this.removeAllListeners();
  }

  static async create({
    room,
    mediaNodeId,
  }: {
    room: Room;
    mediaNodeId: string;
  }): Promise<MediaNode> {
    try {
      const sendRouters = Array.from(room.getRouters());
      const sendPipeTransports = await Promise.all(
        sendRouters.map(router => room.createPipeTransport({ router }))
      );

      const sendPipeTansportsMap = new Map<
        string,
        mediasoupTypes.PipeTransport<AppDataWithRouterId>
      >();
      for (const transport of sendPipeTransports) {
        const routerId = transport.appData.routerId;
        sendPipeTansportsMap.set(routerId, transport);
      }

      const recvRouter = room.getLeastLoadedRouter();
      // const recvPipeTransport = await meeting.createPipeTransport({ router: recvRouter });

      const mediaNode = new MediaNode({
        id: mediaNodeId,
        roomId: room.roomId,
        sendPipeTransports: sendPipeTansportsMap,
        recvRouter,
      });

      room.addMediaNode(mediaNode);
      return mediaNode;
    } catch (error) {
      console.error('create medianode failed', error);
      throw error;
    }
  }

  static getMediaNdode = (nodeId: string): MediaNode | undefined => {
    return MediaNode.MediaNodes.get(nodeId);
  };

  async connectPipeTransport({
    connectionParam,
    transport,
  }: {
    connectionParam: TransportConnectionParams;
    transport: mediasoupTypes.PipeTransport;
  }): Promise<void> {
    try {
      await transport.connect({
        ip: connectionParam.ip,
        port: connectionParam.port,
        srtpParameters: connectionParam.srtpParameters,
      });
    } catch (error) {
      console.error('connectPipeTransport failed', error);
    }
  }

  async createRecvPipeTransport(): Promise<mediasoupTypes.PipeTransport> {
    try {
      const pipeTransport = await this.recvRouter.createPipeTransport({
        listenInfo: config.mediasoup.transportListenInfo,
        enableSctp: true,
        numSctpStreams: { OS: 1024, MIS: 1024 },
        enableRtx: false,
        enableSrtp: false,
        appData: {
          routerId: this.recvRouter.id,
        },
      });
      return pipeTransport;
    } catch (error) {
      console.error('createRecvPipeTransport failed', error);
      throw error;
    }
  }

  getSendPipeTransportsConnectionParam(): TransportConnectionParams[] {
    // get array of the connection params of send tranports
    const connectionParams: TransportConnectionParams[] = [];

    this.sendPipeTransports.forEach((transport, routerId) => {
      connectionParams.push({
        routerId,
        transportId: transport.id,
        sendTransportId: transport.id,
        ip: transport.tuple.localIp,
        port: transport.tuple.localPort,
        srtpParameters: transport.srtpParameters,
      });
    });

    return connectionParams;
  }

  getSendPipeTransport(
    routerId: string
  ): mediasoupTypes.PipeTransport | undefined {
    return this.sendPipeTransports.get(routerId);
  }

  getRecvPipeTransport(
    remoteSendTranportId: string
  ): mediasoupTypes.PipeTransport | undefined {
    return this.recvPipeTransports.get(remoteSendTranportId);
  }

  removeConsumer(id: string): void {
    this.consumers.delete(id);
  }

  addConsumer(consumer: mediasoupTypes.Consumer): void {
    this.consumers.set(consumer.id, consumer);
    consumer.observer.on('close', () => {
      this.consumers.delete(consumer.id);
    });
  }
  getConsumer(id: string): mediasoupTypes.Consumer | undefined {
    return this.consumers.get(id);
  }

  // Producers methods
  addProducer(producer: mediasoupTypes.Producer): void {
    this.producers.set(producer.id, producer);
    producer.observer.on('close', () => {
      this.producers.delete(producer.id);
    });
  }

  getProducers(): mediasoupTypes.Producer[] {
    return Array.from(this.producers.values());
  }

  getProducer(id: string): mediasoupTypes.Producer | undefined {
    return this.producers.get(id);
  }

  removeProducer(id: string): void {
    this.producers.delete(id);
  }
}

export default MediaNode;
