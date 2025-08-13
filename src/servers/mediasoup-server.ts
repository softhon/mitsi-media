import {
  createWorker,
  types as mediasoupTypes,
  observer as mediasoupObserver,
} from 'mediasoup';
import config from '../config';

class MediasoupServer {
  private static instance: MediasoupServer | null;
  private workers: Map<number, mediasoupTypes.Worker>;
  private workerLoads: Map<number, number>;
  private isRunning: boolean;

  private constructor() {
    this.workers = new Map();
    this.workerLoads = new Map();
    this.isRunning = false;
    this.observe();
    this.createWorkers();
  }

  static getInstance(): MediasoupServer {
    if (!MediasoupServer.instance)
      MediasoupServer.instance = new MediasoupServer();

    return MediasoupServer.instance;
  }

  private async createWorkers(): Promise<void> {
    try {
      if (this.isRunning) {
        return console.log('Mediasoup Workers is already created');
      }

      for (let i = 0; i < config.cpus; i++) {
        const worker = await createWorker(config.mediasoup.workerSettings);
        worker.once('died', () => {
          console.error('Worker died', { workerId: worker.pid });
          setTimeout(() => process.exit(1), 2000);
        });

        this.workers.set(worker.pid, worker);
        this.workerLoads.set(worker.pid, 0);
      }
    } catch (error) {
      console.error('Worker start error! \n', error);
      process.exit(1);
    }
  }

  increaseWorkerLoad(workerPid: number): void {
    if (!this.isRunning) {
      console.log('SerStart Mediasoup worker first');
      return;
    }
    if (this.workerLoads.get(workerPid)) {
      this.workerLoads.set(
        workerPid,
        (this.workerLoads.get(workerPid) as number) + 1
      );
    }
  }

  decreaseWorkerLoad(workerPid: number): void {
    if (!this.isRunning) {
      console.log('Start Mediasoup worker first');
      return;
    }
    if (this.workerLoads.get(workerPid)) {
      this.workerLoads.set(
        workerPid,
        (this.workerLoads.get(workerPid) as number) - 1
      );
    }
  }

  getLeastLoadedWorker(): mediasoupTypes.Worker | undefined {
    const sortedWorkerLoads = new Map(
      [...this.workerLoads.entries()].sort((a, b) => a[1] - b[1])
    );
    const workerId = sortedWorkerLoads.keys().next().value;
    if (!workerId) return;
    return this.workers.get(workerId);
  }

  async getRouterRtpCapabilities(): Promise<mediasoupTypes.RtpCapabilities> {
    try {
      if (!this.isRunning) {
        throw 'Start Mediasoup worker first';
      }
      const worker = Array.from(this.workers.values())[0];

      const router = await worker.createRouter({
        mediaCodecs: config.mediasoup.routerMediaCodecs,
      });
      const routerRtpCapabilities = router.rtpCapabilities;
      router.close();
      return routerRtpCapabilities;
    } catch (error) {
      console.error('getRouterRtpCapabilities error', { error });
      throw error;
    }
  }

  private observe(): void {
    mediasoupObserver.on('newworker', worker => {
      worker.appData.routers = new Map();
      worker.appData.transports = new Map();
      worker.appData.producers = new Map();
      worker.appData.consumers = new Map();
      worker.appData.dataProducers = new Map();
      worker.appData.dataConsumers = new Map();
      worker.appData.load = 0;

      worker.observer.on('close', () => {
        console.info('Worker closed');
      });

      worker.observer.on('newrouter', router => {
        router.appData.transports = new Map();
        router.appData.producers = new Map();
        router.appData.consumers = new Map();
        router.appData.dataProducers = new Map();
        router.appData.dataConsumers = new Map();

        router.appData.worker = worker;
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
          transport.appData.producers = new Map();
          transport.appData.consumers = new Map();
          transport.appData.dataProducers = new Map();
          transport.appData.dataConsumers = new Map();

          transport.appData.router = router;
          (
            router.appData.transports as Map<string, mediasoupTypes.Transport>
          ).set(transport.id, transport);
          (
            worker.appData.transports as Map<string, mediasoupTypes.Transport>
          ).set(transport.id, transport);

          transport.observer.on('close', () => {
            (
              router.appData.transports as Map<string, mediasoupTypes.Transport>
            ).delete(transport.id);
            (
              worker.appData.transports as Map<string, mediasoupTypes.Transport>
            ).delete(transport.id);
          });

          transport.observer.on('newproducer', producer => {
            producer.appData.transport = producer;
            (
              transport.appData.producers as Map<
                string,
                mediasoupTypes.Producer
              >
            ).set(producer.id, producer);
            (
              router.appData.producers as Map<string, mediasoupTypes.Producer>
            ).set(producer.id, producer);
            (
              worker.appData.producers as Map<string, mediasoupTypes.Producer>
            ).set(producer.id, producer);

            producer.observer.on('close', () => {
              (
                transport.appData.producers as Map<
                  string,
                  mediasoupTypes.Producer
                >
              ).delete(producer.id);
              (
                router.appData.producers as Map<string, mediasoupTypes.Producer>
              ).delete(producer.id);
              (
                worker.appData.producers as Map<string, mediasoupTypes.Producer>
              ).delete(producer.id);
            });
          });

          transport.observer.on('newconsumer', consumer => {
            consumer.appData.transport = consumer;
            (
              transport.appData.consumers as Map<
                string,
                mediasoupTypes.Consumer
              >
            ).set(consumer.id, consumer);
            (
              router.appData.consumers as Map<string, mediasoupTypes.Consumer>
            ).set(consumer.id, consumer);
            (
              worker.appData.consumers as Map<string, mediasoupTypes.Consumer>
            ).set(consumer.id, consumer);

            consumer.observer.on('close', () => {
              (
                transport.appData.consumers as Map<
                  string,
                  mediasoupTypes.Consumer
                >
              ).delete(consumer.id);
              (
                router.appData.consumers as Map<string, mediasoupTypes.Consumer>
              ).delete(consumer.id);
              (
                worker.appData.consumers as Map<string, mediasoupTypes.Consumer>
              ).delete(consumer.id);
            });
          });
        });
      });
    });
  }
}

export const mediaSoupServer = MediasoupServer.getInstance();
