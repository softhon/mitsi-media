import path from 'path';
import { EventEmitter } from 'events';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

import { MessageRequest } from '../protos/gen/mediaSignalingPackage/MessageRequest';
import { MessageResponse } from '../protos/gen/mediaSignalingPackage/MessageResponse';
import { MediaSignalingHandlers } from '../protos/gen/mediaSignalingPackage/MediaSignaling';
import { ProtoGrpcType } from '../protos/gen/media-signaling';

import config from '../config';
import SignalNode from '../services/signalnode';

class GrpcServer extends EventEmitter {
  private static instance: GrpcServer | null = null;
  private server: grpc.Server;
  private startTime: Date;
  private cleanupInterval: NodeJS.Timeout | null;
  private healthCheckInterval: NodeJS.Timeout | null;
  private metricsInterval: NodeJS.Timeout | null;
  private shutdownPromise: Promise<void> | null = null;

  private constructor() {
    super();

    this.server = new grpc.Server();

    this.startTime = new Date();
    this.cleanupInterval = null;
    this.healthCheckInterval = null;
    this.metricsInterval = null;

    this.setup();
  }

  static getInstance(): GrpcServer {
    if (!GrpcServer.instance) {
      GrpcServer.instance = new GrpcServer();
    }
    return GrpcServer.instance;
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.bindAsync(
        `0.0.0.0:${config.grpcPort}`,
        grpc.ServerCredentials.createInsecure(),
        (err, port) => {
          if (err) {
            console.error('Failed to bind gRPC server:', err);
            reject(err);
            return;
          }
          console.log(`gRPC Media Signaling Server started successfully`);
          console.log(`Server listening on 0.0.0.0:${port}`);
          resolve();
        }
      );
    });
  }

  private setup(): void {
    try {
      const PROTO_FILE = path.resolve(
        __dirname,
        '../protos/media-signaling.proto'
      );

      const packageDefinition = protoLoader.loadSync(PROTO_FILE, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const protoDescriptor = grpc.loadPackageDefinition(
        packageDefinition
      ) as unknown as ProtoGrpcType;

      const mediaSignaling =
        protoDescriptor.mediaSignalingPackage.MediaSignaling;

      this.server.addService(mediaSignaling.service, {
        Message: this.handleMessage.bind(this),
      } as MediaSignalingHandlers);

      console.log('gRPC service definitions loaded successfully');
    } catch (error) {
      console.error('Failed to setup gRPC service:', error);
      throw error;
    }
  }

  private handleMessage(
    call: grpc.ServerDuplexStream<MessageRequest, MessageResponse>
  ): void {
    const connectionId = this.generateConnectionId();
    const clientMetadata = call.metadata;
    const clientId =
      clientMetadata.get('clientid')[0]?.toString() || connectionId;
    const remoteAddress = call.getPeer();

    console.log(`🔌 New gRPC connection established`);
    console.log(`   Client ID: ${clientId}`);
    console.log(`   Connection ID: ${connectionId}`);
    console.log(`   Remote Address: ${remoteAddress}`);

    // Create SignalNode with enhanced error handling
    new SignalNode({
      id: clientId,
      call,
      connectionId,
    });
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private clearIntervals(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  private async closeAllConnections(): Promise<void> {
    const nodes = SignalNode.getNodes();
    console.log(`Closing ${nodes.length} active connections...`);

    if (nodes.length === 0) {
      return;
    }

    const closePromises = nodes.map(node =>
      node.gracefulDisconnect('server_shutdown').catch(error => {
        console.warn(`Error closing connection ${node.id}:`, error);
      })
    );

    await Promise.allSettled(closePromises);
    console.log(' All connections closed');
  }

  public getConnectionById(id: string): SignalNode | undefined {
    return SignalNode.getNodeById(id);
  }

  public getAllConnections(): SignalNode[] {
    return SignalNode.getNodes();
  }
}

export const grpcServer = GrpcServer.getInstance();
export { GrpcServer };
