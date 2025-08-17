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
import { MediaSignalingActions as MSA } from '../types/actions';

interface ServerStats {
  totalConnections: number;
  activeConnections: number;
  totalMessagesReceived: number;
  totalMessagesSent: number;
  uptime: number;
  startTime: Date;
}

class GrpcServer extends EventEmitter {
  private static instance: GrpcServer | null = null;
  private server: grpc.Server;
  private isRunning: boolean;
  private startTime: Date;
  private stats: ServerStats;
  private cleanupInterval: NodeJS.Timeout | null;

  private constructor() {
    super();
    this.server = new grpc.Server({
      'grpc.keepalive_time_ms': 10000,
      'grpc.keepalive_timeout_ms': 5000,
      'grpc.keepalive_permit_without_calls': 1,
      'grpc.http2.max_pings_without_data': 0,
      'grpc.http2.min_time_between_pings_ms': 10000,
      'grpc.http2.min_ping_interval_without_data_ms': 300000,
      'grpc.max_connection_idle_ms': 300000,
      'grpc.max_connection_age_ms': 600000,
      'grpc.max_connection_age_grace_ms': 30000,
    });

    this.isRunning = false;
    this.startTime = new Date();
    this.cleanupInterval = null;

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      totalMessagesReceived: 0,
      totalMessagesSent: 0,
      uptime: 0,
      startTime: this.startTime,
    };

    this.setup();

    // Graceful shutdown handling
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
  }

  static getInstance(): GrpcServer {
    if (!GrpcServer.instance) {
      GrpcServer.instance = new GrpcServer();
    }
    return GrpcServer.instance;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('gRPC server is already running');
      return;
    }

    try {
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

            this.isRunning = true;
            this.startTime = new Date();
            this.stats.startTime = this.startTime;

            console.log(`gRPC Media Signaling Server started on port ${port}`);
            console.log(
              `Server ready to accept connections at 0.0.0.0:${port}`
            );
            resolve();
          }
        );
      });
    } catch (error) {
      console.error('Error starting gRPC server:', error);
      throw error;
    }
  }

  private setup(): void {
    const PROTO_FILE = path.resolve(
      __dirname,
      '../protos/media-signaling.proto'
    );
    const packageDefinition = protoLoader.loadSync(PROTO_FILE);
    const protoDescriptor = grpc.loadPackageDefinition(
      packageDefinition
    ) as unknown as ProtoGrpcType;

    const mediaSignaling = protoDescriptor.mediaSignalingPackage.MediaSignaling;

    this.server.addService(mediaSignaling.service, {
      Message: this.handleMessage.bind(this),
    } as MediaSignalingHandlers);
  }

  private handleMessage(
    call: grpc.ServerDuplexStream<MessageRequest, MessageResponse>
  ): void {
    const nodeId = this.extractNodeId(call.metadata);

    new SignalNode({ id: nodeId, call });

    this.stats.totalConnections++;
    this.stats.activeConnections++;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('gRPC server is not running');
      return;
    }
    console.log('Stopping gRPC server...');

    // Close all active connections first
    await this.closeAllConnections();

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    return new Promise<void>(resolve => {
      this.server.tryShutdown(error => {
        if (error) {
          console.error('Error during server shutdown:', error);
          // Force shutdown if graceful shutdown fails
          this.server.forceShutdown();
        }
        this.isRunning = false;
        console.log('gRPC server stopped successfully');
        resolve();
      });
    });
  }

  private extractNodeId(metadata: grpc.Metadata): string {
    const nodeId = metadata.get('nodeId')?.[0];
    return typeof nodeId === 'string' ? nodeId : `snode-${crypto.randomUUID()}`;
  }

  private async closeAllConnections(): Promise<void> {
    console.log(
      `🔌 Closing ${SignalNode.getNodes().length} active connections...`
    );

    const closePromises: Promise<void>[] = [];

    SignalNode.getNodes().forEach(node => {
      closePromises.push(
        new Promise<void>(resolve => {
          // Send shutdown notification
          node.sendMessage(MSA.ServerShutdown, {
            message: 'Server is shutting down',
            timestamp: Date.now().toString(),
          });

          // Clean up connection
          setTimeout(() => {
            // this.handleClientDisconnection(clientId, 'server_shutdown');
            resolve();
          }, 1000);
        })
      );
    });

    await Promise.all(closePromises);
    console.log('All connections closed');
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    console.log(`\nReceived ${signal}, starting graceful shutdown...`);

    try {
      await this.stop();
      this.removeAllListeners();
      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  // Public API methods
  public getStats(): ServerStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime.getTime(),
    };
  }

  public broadcastMessage(message: {
    type: MSA;
    args?: { [key: string]: unknown };
  }): void {
    SignalNode.getNodes().forEach(node => {
      node.sendMessage(message.type, message.args);
    });
  }

  public checkIsRunning(): boolean {
    return this.isRunning;
  }
}

export const grpcServer = GrpcServer.getInstance();
