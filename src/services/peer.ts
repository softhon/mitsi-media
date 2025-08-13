import EventEmitter from 'events';
import { types as mediasoupTypes } from 'mediasoup';
import { PeerType, ProducerSource } from '../types/interfaces';
import { mediaSoupServer } from '../servers/mediasoup-server';

class Peer extends EventEmitter {
  id: string;
  roomId: string;
  closed: boolean;
  signalNodeId: string;
  type: PeerType;

  rtpCapabilities: mediasoupTypes.RtpCapabilities;
  transports: Map<string, mediasoupTypes.WebRtcTransport>;
  producers: Map<string, mediasoupTypes.Producer>;
  consumers: Map<string, mediasoupTypes.Consumer>;

  router: mediasoupTypes.Router;
  workerPid: number;

  static peers = new Map<string, Peer>();

  constructor({
    id,
    roomId,
    router,
    rtpCapabilities,
    signalNodeId,
    type,
  }: {
    id: string;
    roomId: string;
    router: mediasoupTypes.Router;
    rtpCapabilities: mediasoupTypes.RtpCapabilities;
    signalNodeId: string;
    type: PeerType;
  }) {
    super();
    this.id = id;
    this.roomId = roomId;
    this.closed = false;
    this.rtpCapabilities = rtpCapabilities;
    this.router = router;
    this.workerPid = (router.appData.worker as mediasoupTypes.Worker).pid;
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    this.signalNodeId = signalNodeId;
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

  // transport methods
  addTransport(transport: mediasoupTypes.WebRtcTransport): void {
    this.transports.set(transport.id, transport);
    transport.observer.on('close', () => {
      this.transports.delete(transport.id);
    });
  }

  getTransport(id: string): mediasoupTypes.WebRtcTransport | undefined {
    return this.transports.get(id);
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
