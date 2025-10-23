import {
  createWorker,
  types as mediasoupTypes,
  observer as mediasoupObserver,
} from 'mediasoup';
import config from '../config';

interface WorkerInfo {
  pid: number;
  worker: mediasoupTypes.Worker;
  load: number;
  isHealthy: boolean;
  usage?: mediasoupTypes.WorkerResourceUsage;
}

interface ServerMetrics {
  totalWorkers: number;
  activeWorkers: number;
  totalLoad: number;
  averageLoad: number;
}

export class MediasoupServer {
  private static instance: MediasoupServer | null = null;
  private workers: Map<number, WorkerInfo> = new Map();
  private isRunning: boolean = false;
  private routerRtpCapabilities: mediasoupTypes.RtpCapabilities | null = null;
  private initializationPromise: Promise<void> | null = null;
  private readonly maxWorkerLoad: number;

  private constructor() {
    this.maxWorkerLoad = config.mediasoup.maxWorkerLoad;
  }

  static getInstance(): MediasoupServer {
    if (!MediasoupServer.instance) {
      MediasoupServer.instance = new MediasoupServer();
    }
    return MediasoupServer.instance;
  }

  async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  async start(): Promise<void> {
    try {
      this.observe();
      await this.createWorkers();
      this.isRunning = true;

      console.info('MediasoupServer started successfully');
    } catch (error) {
      console.error('Failed to start MediasoupServer:', error);
      throw error;
    }
  }

  private async createWorkers(): Promise<void> {
    const workerPromises: Promise<void>[] = [];
    const numWorkers = config.cpus;

    for (let i = 0; i < numWorkers; i++) {
      workerPromises.push(this.createSingleWorker(i));
    }

    await Promise.all(workerPromises);
    console.info(`Created ${numWorkers} mediasoup workers`);
  }

  private async createSingleWorker(index: number): Promise<void> {
    try {
      const worker = await createWorker({
        ...config.mediasoup.workerSettings,
        appData: { index },
      });

      // Create WebRTC server for this worker
      await worker.createWebRtcServer(config.mediasoup.webRtcServer);

      this.setupWorkerEventHandlers(worker);

      const workerInfo: WorkerInfo = {
        pid: worker.pid,
        worker,
        load: 0,
        isHealthy: true,
      };

      this.workers.set(worker.pid, workerInfo);
      console.info(`Worker ${worker.pid} created successfully`);
    } catch (error) {
      console.error(`Failed to create worker ${index}:`, error);
      throw error;
    }
  }

  private setupWorkerEventHandlers(worker: mediasoupTypes.Worker): void {
    worker.once('died', () => {
      console.error(`Worker ${worker.pid} died unexpectedly`);
      // this.handleWorkerDeath(worker.pid);
    });

    worker.on('subprocessclose', () => {
      console.warn(`Worker ${worker.pid} subprocess closed`);
    });

    // Handle resource usage monitoring
    worker.observer.on('close', () => {
      console.info(`Worker ${worker.pid} closed`);
      this.workers.delete(worker.pid);
    });
  }

  increaseWorkerLoad(workerPid: number): boolean {
    this.ensureRunning();

    const workerInfo = this.workers.get(workerPid);
    if (!workerInfo) {
      console.warn(`Worker ${workerPid} not found`);
      return false;
    }

    if (workerInfo.load >= this.maxWorkerLoad) {
      console.warn(`Worker ${workerPid} is at maximum load`);
      return false;
    }

    workerInfo.load += 1;
    return true;
  }

  decreaseWorkerLoad(workerPid: number): boolean {
    this.ensureRunning();

    const workerInfo = this.workers.get(workerPid);
    if (!workerInfo) {
      console.warn(`Worker ${workerPid} not found`);
      return false;
    }

    workerInfo.load = Math.max(0, workerInfo.load - 1);
    return true;
  }

  getHealthyWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values()).filter(info => info.isHealthy);
  }

  getLeastLoadedWorker(): mediasoupTypes.Worker | null {
    const healthyWorkers = this.getHealthyWorkers();

    if (healthyWorkers.length === 0) {
      console.error('No healthy workers available');
      return null;
    }

    const leastLoaded = healthyWorkers.reduce((min, current) =>
      current.load < min.load ? current : min
    );

    return leastLoaded.worker;
  }

  async getWorkerWithCapacity(): Promise<mediasoupTypes.Worker | null> {
    const worker = this.getLeastLoadedWorker();
    if (!worker) return null;

    const workerInfo = this.workers.get(worker.pid);
    if (!workerInfo || workerInfo.load >= this.maxWorkerLoad) {
      console.warn('All workers are at capacity');
      return null;
    }

    return worker;
  }

  async getRouterRtpCapabilities(): Promise<mediasoupTypes.RtpCapabilities> {
    this.ensureRunning();

    if (this.routerRtpCapabilities) {
      return this.routerRtpCapabilities;
    }

    try {
      const worker = this.getLeastLoadedWorker();
      if (!worker) {
        throw new Error('No healthy workers available for router creation');
      }

      const router = await worker.createRouter({
        mediaCodecs: config.mediasoup.routerMediaCodecs,
      });

      this.routerRtpCapabilities = router.rtpCapabilities;

      // Close the temporary router
      router.close();

      return this.routerRtpCapabilities;
    } catch (error) {
      console.error('Failed to get router RTP capabilities:', error);
      throw error;
    }
  }

  getServerMetrics(): ServerMetrics {
    const workerInfos = Array.from(this.workers.values());
    const activeWorkers = workerInfos.filter(info => info.isHealthy);
    const totalLoad = activeWorkers.reduce((sum, info) => sum + info.load, 0);

    return {
      totalWorkers: workerInfos.length,
      activeWorkers: activeWorkers.length,
      totalLoad,
      averageLoad:
        activeWorkers.length > 0 ? totalLoad / activeWorkers.length : 0,
    };
  }

  shutdown(): void {
    this.isRunning = false;

    Array.from(this.workers.values()).map(workerInfo => {
      try {
        workerInfo.worker.close();
      } catch (error) {
        console.error(`Error closing worker ${workerInfo.worker.pid}:`, error);
      }
    });

    this.workers.clear();
    console.info('Gracefully shutdown media server');
  }

  private ensureRunning(): void {
    if (!this.isRunning) {
      throw new Error(
        'MediasoupServer is not running. Call waitForInitialization() first.'
      );
    }
  }

  private observe(): void {
    mediasoupObserver.on('newworker', worker => {
      // Initialize worker app data
      worker.appData.routers = new Map();
      worker.appData.transports = new Map();
      worker.appData.producers = new Map();
      worker.appData.consumers = new Map();
      worker.appData.dataProducers = new Map();
      worker.appData.dataConsumers = new Map();
      worker.appData.webRtcServer = null;

      // Set up observer chain for resource tracking
      this.setupWorkerObservers(worker);
    });
  }

  private setupWorkerObservers(worker: mediasoupTypes.Worker): void {
    worker.observer.on('close', () => {
      console.info(`Worker ${worker.pid} observer closed`);
    });

    worker.observer.on('newwebrtcserver', webRtcServer => {
      console.info(`WebRTC server created for worker ${worker.pid}`);
      worker.appData.webRtcServer = webRtcServer;
    });

    worker.observer.on('newrouter', router => {
      this.setupRouterObservers(router, worker);
    });
  }

  private setupRouterObservers(
    router: mediasoupTypes.Router,
    worker: mediasoupTypes.Worker
  ): void {
    // Initialize router app data
    router.appData.transports = new Map();
    router.appData.producers = new Map();
    router.appData.consumers = new Map();
    router.appData.dataProducers = new Map();
    router.appData.dataConsumers = new Map();
    router.appData.webRtcServer = worker.appData.webRtcServer;
    router.appData.worker = worker;

    // Add router to worker's collection
    (worker.appData.routers as Map<string, mediasoupTypes.Router>).set(
      router.id,
      router
    );

    router.observer.on('close', () => {
      (worker.appData.routers as Map<string, mediasoupTypes.Router>).delete(
        router.id
      );
    });

    router.observer.on('newtransport', transport => {
      this.setupTransportObservers(transport, router, worker);
    });
  }

  private setupTransportObservers(
    transport: mediasoupTypes.Transport,
    router: mediasoupTypes.Router,
    worker: mediasoupTypes.Worker
  ): void {
    // Initialize transport app data
    transport.appData.producers = new Map();
    transport.appData.consumers = new Map();
    transport.appData.dataProducers = new Map();
    transport.appData.dataConsumers = new Map();
    transport.appData.router = router;

    // Add transport to collections
    (router.appData.transports as Map<string, mediasoupTypes.Transport>).set(
      transport.id,
      transport
    );
    (worker.appData.transports as Map<string, mediasoupTypes.Transport>).set(
      transport.id,
      transport
    );

    transport.observer.on('close', () => {
      (
        router.appData.transports as Map<string, mediasoupTypes.Transport>
      ).delete(transport.id);
      (
        worker.appData.transports as Map<string, mediasoupTypes.Transport>
      ).delete(transport.id);
    });

    transport.observer.on('newproducer', producer => {
      this.setupProducerObservers(producer, transport, router, worker);
    });

    transport.observer.on('newconsumer', consumer => {
      this.setupConsumerObservers(consumer, transport, router, worker);
    });
  }

  private setupProducerObservers(
    producer: mediasoupTypes.Producer,
    transport: mediasoupTypes.Transport,
    router: mediasoupTypes.Router,
    worker: mediasoupTypes.Worker
  ): void {
    producer.appData.transport = transport;

    // Add producer to collections
    (transport.appData.producers as Map<string, mediasoupTypes.Producer>).set(
      producer.id,
      producer
    );
    (router.appData.producers as Map<string, mediasoupTypes.Producer>).set(
      producer.id,
      producer
    );
    (worker.appData.producers as Map<string, mediasoupTypes.Producer>).set(
      producer.id,
      producer
    );

    producer.observer.on('close', () => {
      (
        transport.appData.producers as Map<string, mediasoupTypes.Producer>
      ).delete(producer.id);
      (router.appData.producers as Map<string, mediasoupTypes.Producer>).delete(
        producer.id
      );
      (worker.appData.producers as Map<string, mediasoupTypes.Producer>).delete(
        producer.id
      );
    });
  }

  private setupConsumerObservers(
    consumer: mediasoupTypes.Consumer,
    transport: mediasoupTypes.Transport,
    router: mediasoupTypes.Router,
    worker: mediasoupTypes.Worker
  ): void {
    consumer.appData.transport = transport;

    // Add consumer to collections
    (transport.appData.consumers as Map<string, mediasoupTypes.Consumer>).set(
      consumer.id,
      consumer
    );
    (router.appData.consumers as Map<string, mediasoupTypes.Consumer>).set(
      consumer.id,
      consumer
    );
    (worker.appData.consumers as Map<string, mediasoupTypes.Consumer>).set(
      consumer.id,
      consumer
    );

    consumer.observer.on('close', () => {
      (
        transport.appData.consumers as Map<string, mediasoupTypes.Consumer>
      ).delete(consumer.id);
      (router.appData.consumers as Map<string, mediasoupTypes.Consumer>).delete(
        consumer.id
      );
      (worker.appData.consumers as Map<string, mediasoupTypes.Consumer>).delete(
        consumer.id
      );
    });
  }

  // Utility methods for debugging and monitoring

  async getWorkerResourceUsage(workerPid: number): Promise<WorkerInfo | null> {
    const workerInfo = this.workers.get(workerPid);
    if (!workerInfo) return null;
    return {
      ...workerInfo,
      usage: await workerInfo.worker.getResourceUsage(),
    };
  }

  async getWorkersResourceUsage(): Promise<WorkerInfo[]> {
    const usagePromises = Array.from(this.workers.values()).map(
      async workerInfo => ({
        ...workerInfo,
        usage: await workerInfo.worker.getResourceUsage(),
      })
    );

    return await Promise.all(usagePromises);
  }
}

// Export singleton instance
export const mediaSoupServer = MediasoupServer.getInstance();
