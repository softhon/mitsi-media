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
import { Actions as MSA } from '../types/actions';

interface ServerStats {
  totalConnections: number;
  activeConnections: number;
  totalMessagesReceived: number;
  totalMessagesSent: number;
  uptime: number;
  startTime: Date;
  errors: {
    connectionErrors: number;
    messageErrors: number;
    protocolErrors: number;
  };
}

interface ServerConfig {
  maxConnections: number;
  messageTimeout: number;
  shutdownGracePeriod: number;
  healthCheckInterval: number;
  metricsReportInterval: number;
}

enum ServerState {
  STOPPED = 'STOPPED',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  STOPPING = 'STOPPING',
  ERROR = 'ERROR',
}

class GrpcServer extends EventEmitter {
  private static instance: GrpcServer | null = null;
  private server: grpc.Server;
  private serverState: ServerState;
  private startTime: Date;
  private stats: ServerStats;
  private cleanupInterval: NodeJS.Timeout | null;
  private healthCheckInterval: NodeJS.Timeout | null;
  private metricsInterval: NodeJS.Timeout | null;
  private readonly config: ServerConfig;
  private shutdownPromise: Promise<void> | null = null;

  private constructor(serverConfig?: Partial<ServerConfig>) {
    super();

    this.config = {
      maxConnections: 1000,
      messageTimeout: 30000,
      shutdownGracePeriod: 10000,
      healthCheckInterval: 30000,
      metricsReportInterval: 60000,
      ...serverConfig,
    };

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
      'grpc.max_receive_message_length': 4 * 1024 * 1024, // 4MB
      'grpc.max_send_message_length': 4 * 1024 * 1024, // 4MB
    });

    this.serverState = ServerState.STOPPED;
    this.startTime = new Date();
    this.cleanupInterval = null;
    this.healthCheckInterval = null;
    this.metricsInterval = null;

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      totalMessagesReceived: 0,
      totalMessagesSent: 0,
      uptime: 0,
      startTime: this.startTime,
      errors: {
        connectionErrors: 0,
        messageErrors: 0,
        protocolErrors: 0,
      },
    };

    this.setup();
    this.startPeriodicTasks();

    // Graceful shutdown handling
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('uncaughtException', error =>
      this.handleUncaughtException(error)
    );
  }

  static getInstance(serverConfig?: Partial<ServerConfig>): GrpcServer {
    if (!GrpcServer.instance) {
      GrpcServer.instance = new GrpcServer(serverConfig);
    }
    return GrpcServer.instance;
  }

  async start(): Promise<void> {
    if (this.serverState === ServerState.RUNNING) {
      console.log('🔄 gRPC server is already running');
      return;
    }

    if (this.serverState === ServerState.STARTING) {
      console.log('⏳ gRPC server is already starting');
      return;
    }

    this.setState(ServerState.STARTING);

    try {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Server start timeout'));
        }, 30000);

        this.server.bindAsync(
          `0.0.0.0:${config.grpcPort}`,
          grpc.ServerCredentials.createInsecure(),
          (err, port) => {
            clearTimeout(timeoutId);

            if (err) {
              console.error('❌ Failed to bind gRPC server:', err);
              this.setState(ServerState.ERROR);
              this.stats.errors.connectionErrors++;
              reject(err);
              return;
            }

            this.setState(ServerState.RUNNING);
            this.startTime = new Date();
            this.stats.startTime = this.startTime;

            console.log(`✅ gRPC Media Signaling Server started successfully`);
            console.log(`🌐 Server listening on 0.0.0.0:${port}`);
            console.log(`📊 Max connections: ${this.config.maxConnections}`);

            this.emit('serverStarted', { port, timestamp: new Date() });
            resolve();
          }
        );
      });
    } catch (error) {
      console.error('💥 Critical error starting gRPC server:', error);
      this.setState(ServerState.ERROR);
      this.emit('serverError', { error, timestamp: new Date() });
      throw error;
    }
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

      console.log('📋 gRPC service definitions loaded successfully');
    } catch (error) {
      console.error('❌ Failed to setup gRPC service:', error);
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

    // Check connection limits
    if (this.stats.activeConnections >= this.config.maxConnections) {
      console.warn(
        `⚠️  Connection limit reached (${this.config.maxConnections}), rejecting client ${clientId}`
      );
      call.destroy(new Error('Server connection limit reached'));
      return;
    }

    try {
      // Create SignalNode with enhanced error handling
      new SignalNode({
        id: clientId,
        call,
        connectionId,
      });

      // Update server stats
      this.stats.totalConnections++;
      this.stats.activeConnections++;

      // Set up connection cleanup
      const cleanup = (): void => {
        this.stats.activeConnections = Math.max(
          0,
          this.stats.activeConnections - 1
        );
        this.emit('connectionClosed', {
          clientId,
          connectionId,
          timestamp: new Date(),
          activeConnections: this.stats.activeConnections,
        });
      };

      call.on('close', cleanup);
      call.on('cancelled', cleanup);

      this.emit('connectionOpened', {
        clientId,
        connectionId,
        remoteAddress,
        timestamp: new Date(),
        activeConnections: this.stats.activeConnections,
      });
    } catch (error) {
      console.error(
        `❌ Error creating SignalNode for client ${clientId}:`,
        error
      );
      this.stats.errors.connectionErrors++;
      // call.destroy(error);
    }
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setState(newState: ServerState): void {
    if (this.serverState !== newState) {
      const oldState = this.serverState;
      this.serverState = newState;
      console.log(`📡 Server state changed: ${oldState} -> ${newState}`);
      this.emit('stateChanged', { oldState, newState, timestamp: new Date() });
    }
  }

  private startPeriodicTasks(): void {
    // Health check interval
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Metrics reporting interval
    this.metricsInterval = setInterval(() => {
      this.reportMetrics();
    }, this.config.metricsReportInterval);

    // Cleanup interval for stale connections
    this.cleanupInterval = setInterval(() => {
      // this.cleanupStaleConnections();
    }, 60000); // Every minute
  }

  private performHealthCheck(): void {
    try {
      const stats = this.getStats();
      const memoryUsage = process.memoryUsage();

      // console.log(
      //   `💗 Health Check - Active: ${stats.activeConnections}, Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
      // );

      this.emit('healthCheck', {
        stats,
        memoryUsage,
        timestamp: new Date(),
      });

      // Check for memory leaks
      if (memoryUsage.heapUsed > 512 * 1024 * 1024) {
        // 512MB threshold
        // console.warn('⚠️  High memory usage detected:', memoryUsage);
        // this.emit('memoryWarning', { memoryUsage, timestamp: new Date() });
      }
    } catch (error) {
      console.error('❌ Health check failed:', error);
    }
  }

  private reportMetrics(): void {
    const stats = this.getStats();
    // console.log(`📊 Server Metrics:`, {
    //   uptime: `${Math.round(stats.uptime / 1000 / 60)}min`,
    //   connections: `${stats.activeConnections}/${stats.totalConnections}`,
    //   messages: `R:${stats.totalMessagesReceived} S:${stats.totalMessagesSent}`,
    //   errors: stats.errors,
    // });

    this.emit('metricsReport', { stats, timestamp: new Date() });
  }

  async stop(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    if (this.serverState === ServerState.STOPPED) {
      console.log('⏹️  gRPC server is already stopped');
      return;
    }

    this.setState(ServerState.STOPPING);
    console.log('⏹️  Stopping gRPC server...');

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    try {
      // Stop accepting new connections
      console.log('🚫 Stopping new connection acceptance...');

      // Close all active connections gracefully
      await this.closeAllConnections();

      // Clear all intervals
      this.clearIntervals();

      // Shutdown server
      await new Promise<void>(resolve => {
        const timeoutId = setTimeout(() => {
          console.warn('⚠️  Graceful shutdown timeout, forcing shutdown');
          this.server.forceShutdown();
          resolve();
        }, this.config.shutdownGracePeriod);

        this.server.tryShutdown(error => {
          clearTimeout(timeoutId);
          if (error) {
            console.error('❌ Error during server shutdown:', error);
            this.server.forceShutdown();
          }
          resolve();
        });
      });

      this.setState(ServerState.STOPPED);
      console.log('✅ gRPC server stopped successfully');
      this.emit('serverStopped', { timestamp: new Date() });
    } catch (error) {
      console.error('💥 Error during shutdown:', error);
      this.setState(ServerState.ERROR);
      throw error;
    } finally {
      this.shutdownPromise = null;
    }
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
    console.log(`🔌 Closing ${nodes.length} active connections...`);

    if (nodes.length === 0) {
      return;
    }

    const closePromises = nodes.map(node =>
      node.gracefulDisconnect('server_shutdown').catch(error => {
        console.warn(`⚠️  Error closing connection ${node.id}:`, error);
      })
    );

    await Promise.allSettled(closePromises);
    console.log('✅ All connections closed');
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);

    try {
      await this.stop();
      this.removeAllListeners();
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('💥 Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  private handleUncaughtException(error: Error): void {
    console.error('🚨 Uncaught Exception:', error);
    this.emit('uncaughtException', { error, timestamp: new Date() });

    // Attempt graceful shutdown
    this.gracefulShutdown('uncaughtException').catch(() => {
      process.exit(1);
    });
  }

  // Public API methods
  public getStats(): ServerStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime.getTime(),
    };
  }

  public getState(): ServerState {
    return this.serverState;
  }

  public isRunning(): boolean {
    return this.serverState === ServerState.RUNNING;
  }

  public incrementMessageStats(sent: number = 0, received: number = 0): void {
    this.stats.totalMessagesSent += sent;
    this.stats.totalMessagesReceived += received;
  }

  public incrementErrorStats(type: keyof ServerStats['errors']): void {
    this.stats.errors[type]++;
  }

  public broadcastMessage(message: {
    type: MSA;
    args?: { [key: string]: unknown };
    excludeIds?: string[];
  }): { sent: number; failed: number } {
    const nodes = SignalNode.getNodes();
    const eligibleNodes = message.excludeIds
      ? nodes.filter(node => !message.excludeIds!.includes(node.id))
      : nodes;

    let sent = 0;
    let failed = 0;

    eligibleNodes.forEach(node => {
      if (node.sendMessage(message.type, message.args)) {
        sent++;
      } else {
        failed++;
      }
    });

    console.log(`📢 Broadcast ${message.type}: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  }

  public getConnectionById(id: string): SignalNode | undefined {
    return SignalNode.getNodeById(id);
  }

  public getAllConnections(): SignalNode[] {
    return SignalNode.getNodes();
  }
}

export const grpcServer = GrpcServer.getInstance();
export { ServerState, GrpcServer };
