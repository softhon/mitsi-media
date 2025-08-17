import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { EventEmitter } from 'events';

import config from '../config';
import { SendMessageRequest } from '../protos/gen/mediaSignalingPackage/SendMessageRequest';
import { SendMessageResponse } from '../protos/gen/mediaSignalingPackage/SendMessageResponse';
import { MediaSignalingHandlers } from '../protos/gen/mediaSignalingPackage/MediaSignaling';
import { ProtoGrpcType } from '../protos/gen/media-signaling';

interface ClientConnection {
  id: string;
  nodeId?: string;
  call: grpc.ServerDuplexStream<SendMessageRequest, SendMessageResponse>;
  metadata: grpc.Metadata;
  connectedAt: Date;
  lastActivity: Date;
  isActive: boolean;
  heartbeatInterval?: NodeJS.Timeout;
}

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
  private connections: Map<string, ClientConnection>;
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

    this.connections = new Map();
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
    this.setupCleanupInterval();

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

            console.log(
              `✅ gRPC Media Signaling Server started on port ${port}`
            );
            console.log(
              `📡 Server ready to accept connections at 0.0.0.0:${port}`
            );

            this.emit('serverStarted', { port });
            resolve();
          }
        );
      });
    } catch (error) {
      console.error('Error starting gRPC server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('gRPC server is not running');
      return;
    }

    console.log('🛑 Stopping gRPC server...');

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
        console.log('✅ gRPC server stopped successfully');
        this.emit('serverStopped');
        resolve();
      });
    });
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
      SendMessage: this.handleSendMessage.bind(this),
    } as MediaSignalingHandlers);
  }

  private handleSendMessage(
    call: grpc.ServerDuplexStream<SendMessageRequest, SendMessageResponse>
  ): void {
    const clientId = this.extractClientId(call.metadata);
    const nodeId = this.extractNodeId(call.metadata);

    const connection: ClientConnection = {
      id: clientId,
      nodeId,
      call,
      metadata: call.metadata,
      connectedAt: new Date(),
      lastActivity: new Date(),
      isActive: true,
    };

    // Store connection
    this.connections.set(clientId, connection);
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    console.log(
      `📱 New client connected: ${clientId}${nodeId ? ` (Node: ${nodeId})` : ''}`
    );
    console.log(`📊 Active connections: ${this.stats.activeConnections}`);

    this.emit('clientConnected', { clientId, nodeId, connection });

    // Setup heartbeat for this connection
    this.setupHeartbeat(connection);

    // Handle incoming messages
    call.on('data', (message: SendMessageRequest) => {
      this.handleClientMessage(connection, message);
    });

    // Handle client disconnection
    call.on('end', () => {
      console.log(`📤 Client ${clientId} ended the connection`);
      this.handleClientDisconnection(clientId, 'client_ended');
    });

    // Handle errors
    call.on('error', (error: Error) => {
      console.error(`❌ Error with client ${clientId}:`, error.message);
      this.handleClientDisconnection(clientId, 'error', error);
    });

    // Handle call cancellation
    call.on('cancelled', () => {
      console.log(`🚫 Client ${clientId} cancelled the connection`);
      this.handleClientDisconnection(clientId, 'cancelled');
    });

    // Send initial connection confirmation
    this.sendToClient(clientId, {
      type: 'connection_confirmed',
      args: JSON.stringify({
        status: 'success',
        clientId,
        serverTime: Date.now().toString(),
        message: 'Successfully connected to Media Signaling Server',
      }),
    });
  }

  private handleClientMessage(
    connection: ClientConnection,
    message: SendMessageRequest
  ): void {
    connection.lastActivity = new Date();
    this.stats.totalMessagesReceived++;

    console.log(
      `📨 Message from client ${connection.id} (${message.type}):`,
      message.args
    );

    this.emit('messageReceived', {
      clientId: connection.id,
      nodeId: connection.nodeId,
      message,
      connection,
    });

    // Handle specific message types
    switch (message.type) {
      case 'connect':
        this.handleConnectMessage(connection, message);
        break;

      case 'disconnect':
        this.handleDisconnectMessage(connection, message);
        break;

      case 'ping':
        this.handlePingMessage(connection, message);
        break;

      case 'media_request':
        this.handleMediaRequest(connection, message);
        break;

      default:
        console.log(`🔄 Relaying message type: ${message.type}`);
        this.relayMessageToNodes(connection, message);
        break;
    }
  }

  private handleConnectMessage(
    connection: ClientConnection,
    message: SendMessageRequest
  ): void {
    console.log(`✅ Client ${connection.id} sent connect confirmation`);

    // Update connection info if nodeId is provided
    console.log(message.args);

    this.sendToClient(connection.id, {
      type: 'connect_ack',
      args: JSON.stringify({
        status: 'acknowledged',
        serverTime: Date.now(),
        activeConnections: this.stats.activeConnections,
      }),
    });
  }

  private handleDisconnectMessage(
    connection: ClientConnection,
    message: SendMessageRequest
  ): void {
    console.log(
      `👋 Client ${connection.id} requested disconnection:`,
      message.args
    );

    this.sendToClient(connection.id, {
      type: 'disconnect_ack',
      args: JSON.stringify({
        status: 'acknowledged',
        message: 'Disconnection acknowledged',
      }),
    });

    // Schedule connection cleanup
    setTimeout(() => {
      this.handleClientDisconnection(connection.id, 'client_requested');
    }, 1000);
  }

  private handlePingMessage(
    connection: ClientConnection,
    message: SendMessageRequest
  ): void {
    // Respond to ping with pong
    this.sendToClient(connection.id, {
      type: 'pong',
      args: JSON.stringify({
        timestamp: (message.args || Date.now()).toString(),
        serverTime: Date.now().toString(),
      }),
    });
  }

  private handleMediaRequest(
    connection: ClientConnection,
    message: SendMessageRequest
  ): void {
    console.log(`🎬 Media request from ${connection.id}:`, message.args);

    // Process media request and respond
    this.sendToClient(connection.id, {
      type: 'media_response',
      args: JSON.stringify({
        status: 'processing',
        requestId: message.args || 'unknown',
        message: 'Media request received and processing',
      }),
    });

    // Emit event for external handling
    this.emit('mediaRequest', {
      clientId: connection.id,
      nodeId: connection.nodeId,
      request: message.args,
      connection,
    });
  }

  private relayMessageToNodes(
    sender: ClientConnection,
    message: SendMessageRequest
  ): void {
    // Relay message to other connected nodes (excluding sender)
    let relayCount = 0;

    this.connections.forEach((connection, clientId) => {
      if (clientId !== sender.id && connection.isActive && connection.nodeId) {
        this.sendToClient(clientId, {
          type: 'relay',
          args: JSON.stringify({
            originalSender: sender.nodeId || sender.id,
            originalMessage: message,
            relayedAt: Date.now(),
          }),
        });
        relayCount++;
      }
    });

    console.log(`🔄 Relayed message from ${sender.id} to ${relayCount} nodes`);
  }

  private setupHeartbeat(connection: ClientConnection): void {
    connection.heartbeatInterval = setInterval(() => {
      if (!connection.isActive) {
        return;
      }

      // Check if connection is stale (no activity for 60 seconds)
      const timeSinceLastActivity =
        Date.now() - connection.lastActivity.getTime();
      if (timeSinceLastActivity > 60000) {
        console.log(`💔 Connection ${connection.id} is stale, removing...`);
        this.handleClientDisconnection(connection.id, 'stale_connection');
        return;
      }

      // Send heartbeat
      this.sendToClient(connection.id, {
        type: 'heartbeat',
        args: JSON.stringify({
          serverTime: Date.now(),
          uptime: Date.now() - this.stats.startTime.getTime(),
        }),
      });
    }, 30000); // Send heartbeat every 30 seconds
  }

  private handleClientDisconnection(
    clientId: string,
    reason: string,
    error?: Error
  ): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    console.log(`🔌 Client ${clientId} disconnected (${reason})`);

    // Clear heartbeat
    if (connection.heartbeatInterval) {
      clearInterval(connection.heartbeatInterval);
    }

    // Mark as inactive
    connection.isActive = false;

    // Remove from connections
    this.connections.delete(clientId);
    this.stats.activeConnections = Math.max(
      0,
      this.stats.activeConnections - 1
    );

    console.log(`📊 Active connections: ${this.stats.activeConnections}`);

    this.emit('clientDisconnected', {
      clientId,
      nodeId: connection.nodeId,
      reason,
      error,
      connection,
    });
  }

  private sendToClient(
    clientId: string,
    message: SendMessageResponse
  ): boolean {
    const connection = this.connections.get(clientId);
    if (!connection || !connection.isActive) {
      console.warn(
        `⚠️  Cannot send message to client ${clientId}: connection not found or inactive`
      );
      return false;
    }

    try {
      connection.call.write(message);
      this.stats.totalMessagesSent++;
      connection.lastActivity = new Date();
      return true;
    } catch (error) {
      console.error(`❌ Error sending message to client ${clientId}:`, error);
      this.handleClientDisconnection(clientId, 'send_error', error as Error);
      return false;
    }
  }

  private extractClientId(metadata: grpc.Metadata): string {
    const clientId = metadata.get('clientId')?.[0];
    return typeof clientId === 'string' ? clientId : crypto.randomUUID();
  }

  private extractNodeId(metadata: grpc.Metadata): string | undefined {
    const nodeId = metadata.get('nodeId')?.[0];
    return typeof nodeId === 'string' ? nodeId : undefined;
  }

  private setupCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60000); // Run cleanup every minute
  }

  private performCleanup(): void {
    const now = Date.now();
    let cleanedUp = 0;

    this.connections.forEach((connection, clientId) => {
      const timeSinceLastActivity = now - connection.lastActivity.getTime();

      // Remove connections inactive for more than 5 minutes
      if (timeSinceLastActivity > 300000) {
        console.log(`🧹 Cleaning up stale connection: ${clientId}`);
        this.handleClientDisconnection(clientId, 'cleanup_stale');
        cleanedUp++;
      }
    });

    if (cleanedUp > 0) {
      console.log(`🧹 Cleaned up ${cleanedUp} stale connections`);
    }

    // Update uptime
    this.stats.uptime = now - this.stats.startTime.getTime();
  }

  private async closeAllConnections(): Promise<void> {
    console.log(`🔌 Closing ${this.connections.size} active connections...`);

    const closePromises: Promise<void>[] = [];

    this.connections.forEach((connection, clientId) => {
      closePromises.push(
        new Promise<void>(resolve => {
          // Send shutdown notification
          this.sendToClient(clientId, {
            type: 'server_shutdown',
            args: JSON.stringify({
              message: 'Server is shutting down',
              timestamp: Date.now().toString(),
            }),
          });

          // Clean up connection
          setTimeout(() => {
            this.handleClientDisconnection(clientId, 'server_shutdown');
            resolve();
          }, 1000);
        })
      );
    });

    await Promise.all(closePromises);
    console.log('✅ All connections closed');
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);

    try {
      await this.stop();
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  // Public API methods
  public getStats(): ServerStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime.getTime(),
      activeConnections: this.connections.size,
    };
  }

  public getConnections(): ClientConnection[] {
    return Array.from(this.connections.values());
  }

  public getConnection(clientId: string): ClientConnection | undefined {
    return this.connections.get(clientId);
  }

  public broadcastMessage(
    message: SendMessageResponse,
    excludeClient?: string
  ): number {
    let sentCount = 0;

    this.connections.forEach((connection, clientId) => {
      if (clientId !== excludeClient && connection.isActive) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    });

    console.log(`📢 Broadcasted message to ${sentCount} clients`);
    return sentCount;
  }

  public sendToNode(nodeId: string, message: SendMessageResponse): boolean {
    const connection = Array.from(this.connections.values()).find(
      conn => conn.nodeId === nodeId && conn.isActive
    );

    if (!connection) {
      console.warn(`⚠️  Node ${nodeId} not found or inactive`);
      return false;
    }

    return this.sendToClient(connection.id, message);
  }

  public checkIsRunning(): boolean {
    return this.isRunning;
  }
}

export const grpcServer = GrpcServer.getInstance();
