import EventEmitter from 'events';
import { types as mediasoupTypes } from 'mediasoup';
import { PeerType, ProducerSource } from '../types';
import { mediaSoupServer } from '../servers/mediasoup-server';
import SignalNode from './signalnode';
import { Actions } from '../types/actions';
import { MessageResponse } from '../protos/gen/mediaSignalingPackage/MessageResponse';
import Room from './room';

class Peer extends EventEmitter {
  id: string;
  roomId: string;
  closed: boolean;
  private signalnode: SignalNode;
  type: PeerType;

  private deviceRtpCapabilities: mediasoupTypes.RtpCapabilities;
  private transports: Map<string, mediasoupTypes.WebRtcTransport>;
  private producers: Map<string, mediasoupTypes.Producer>;
  private consumers: Map<string, mediasoupTypes.Consumer>;

  private router: mediasoupTypes.Router;
  workerPid: number;

  static peers = new Map<string, Peer>();

  constructor({
    id,
    roomId,
    router,
    rtpCapabilities,
    signalnode,
    type,
  }: {
    id: string;
    roomId: string;
    router: mediasoupTypes.Router;
    rtpCapabilities: mediasoupTypes.RtpCapabilities;
    signalnode: SignalNode;
    type: PeerType;
  }) {
    super();
    this.id = id;
    this.roomId = roomId;
    this.closed = false;
    this.deviceRtpCapabilities = rtpCapabilities;
    this.router = router;
    this.workerPid = (router.appData.worker as mediasoupTypes.Worker).pid;
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    this.signalnode = signalnode;
    this.type = type;
    // increment worker load
  }

  close(): void {
    this.closed = true;

    for (const consumer of this.consumers.values()) {
      consumer.close();
    }
    for (const producer of this.producers.values()) {
      producer.close();
    }
    for (const transport of this.transports.values()) {
      transport.close();
    }

    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();

    mediaSoupServer.decreaseWorkerLoad(this.workerPid);

    this.removeAllListeners(); // Prevent potential memory leaks
    console.info('Peer closed');
  }

  getDeviceRTPCapabilities(): mediasoupTypes.RtpCapabilities {
    return this.deviceRtpCapabilities;
  }
  getSignalnode(): SignalNode {
    return this.signalnode;
  }

  sendMessage(action: Actions, args?: { [key: string]: unknown }): void {
    this.signalnode.sendMessage(action, args);
  }

  async sendMessageForResponse(
    action: Actions,
    args?: { [key: string]: unknown }
  ): Promise<MessageResponse | null> {
    return this.signalnode.sendMessageForResponse(action, args);
  }

  sendResponse(
    action: Actions,
    requestId: string,
    response: { [key: string]: unknown }
  ): void {
    this.signalnode.sendResponse(action, requestId, response);
  }

  sendError(action: Actions, requestId: string, error: Error | unknown): void {
    this.signalnode.sendError(action, requestId, error);
  }
  // transport methods
  addTransport(transport: mediasoupTypes.WebRtcTransport): void {
    this.transports.set(transport.id, transport);
    transport.observer.on('close', () => {
      this.transports.delete(transport.id);
    });
  }

  async pipeToRouter({
    router,
    producerId,
  }: {
    router: mediasoupTypes.Router;
    producerId: string;
  }): Promise<mediasoupTypes.PipeToRouterResult> {
    return this.router.pipeToRouter({
      router,
      producerId,
    });
  }

  getRouter(): mediasoupTypes.Router {
    return this.router;
  }

  getTransport(id: string): mediasoupTypes.WebRtcTransport | undefined {
    return this.transports.get(id);
  }

  getTransports(): mediasoupTypes.WebRtcTransport[] {
    return Array.from(this.transports.values());
  }

  removeTransport(id: string): void {
    this.transports.delete(id);
  }

  // Producer methods
  addProducer(producer: mediasoupTypes.Producer): void {
    this.producers.set(producer.id, producer);
    producer.observer.on('close', () => {
      this.producers.delete(producer.id);
    });
  }

  getProducer(id: string): mediasoupTypes.Producer | undefined {
    return this.producers.get(id);
  }

  getProducers(): mediasoupTypes.Producer[] {
    return Array.from(this.producers.values());
  }

  removeProducer(id: string): void {
    this.producers.delete(id);
  }

  getProducersBySource(source: ProducerSource): mediasoupTypes.Producer[] {
    const allProducers = Array.from(this.producers.values());
    const producers = allProducers.filter(
      producer => producer.appData.source === source
    );
    return producers;
  }

  closeProducersBySource({
    room,
    source,
  }: {
    room: Room;
    source: ProducerSource;
  }): void {
    try {
      const producers = this.getProducersBySource(source);
      producers.forEach(async producer => {
        if (producer.kind === 'audio' && source === 'mic') {
          const audioLevelObserver = room.audioLevelObservers.get(
            this.router.id
          );
          if (audioLevelObserver) {
            audioLevelObserver
              .removeProducer({
                producerId: producer.id,
              })
              .catch(error => {
                console.log(error);
              });
          }
        }
        producer.close();
      });
    } catch (error) {
      console.error('closeProducersBySource fialed ', { error });
    }
  }
  // Consumers methods
  addConsumer(consumer: mediasoupTypes.Consumer): void {
    this.consumers.set(consumer.id, consumer);
    consumer.observer.on('close', () => {
      this.consumers.delete(consumer.id);
    });
  }

  getConsumer(id: string): mediasoupTypes.Consumer | undefined {
    return this.consumers.get(id);
  }

  getConsumers(): mediasoupTypes.Consumer[] {
    return Array.from(this.consumers.values());
  }

  getConsumerByProducerId(
    producerId: string
  ): mediasoupTypes.Consumer | undefined {
    const allConsumers = Array.from(this.consumers.values());
    const consumer = allConsumers.find(
      consumer => consumer.producerId === producerId
    );
    return consumer;
  }

  getConsumersBySource(source: ProducerSource): mediasoupTypes.Consumer[] {
    const allConsumers = Array.from(this.consumers.values());
    const consumer = allConsumers.filter(
      consumer => consumer.appData.source === source
    );
    return consumer;
  }

  removeConsumer(id: string): void {
    this.consumers.delete(id);
  }
}

export default Peer;
