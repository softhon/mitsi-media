import EventEmitter from 'events';
import * as grpc from '@grpc/grpc-js';

import { MediaSignalingActions as MSA } from '../types/actions';
import { MessageRequest } from '../protos/gen/mediaSignalingPackage/MessageRequest';
import { MessageResponse } from '../protos/gen/mediaSignalingPackage/MessageResponse';
import { grpcServer } from '../servers/grpc-server';

enum ConnectionState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTING = 'DISCONNECTING',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR',
}

interface ConnectionMetrics {
  connectedAt: number;
  lastActivity: number;
  lastHeartbeat: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  heartbeatsReceived: number;
  heartbeatsMissed: number;
}

interface MessageQueueItem {
  action: MSA;
  args?: { [key: string]: unknown };
  timestamp: number;
  retries: number;
  id: string;
}

class SignalNode extends EventEmitter {
  id: string;
  connectionId: string;
  call: grpc.ServerDuplexStream<MessageRequest, MessageResponse>;
  metadata: grpc.Metadata;
  private connectionState: ConnectionState;
  private metrics: ConnectionMetrics;
  private heartbeatInterval?: NodeJS.Timeout;
  private messageQueue: MessageQueueItem[] = [];
  private maxQueueSize: number = 100;
  private messageTimeout: number = 30000;
  private heartbeatTimeout: number = 60000;
  private maxConsecutiveErrors: number = 5;
  private consecutiveErrors: number = 0;
  private isShuttingDown: boolean = false;

  static signalNodes = new Map<string, SignalNode>();

  constructor({
    id,
    call,
    connectionId,
  }: {
    id: string;
    call: grpc.ServerDuplexStream<MessageRequest, MessageResponse>;
    connectionId?: string;
  }) {
    super();

    this.id = id;
    this.connectionId = connectionId || this.generateConnectionId();
    this.call = call;
    this.metadata = call.metadata;
    this.connectionState = ConnectionState.CONNECTING;

    const now = Date.now();
    this.metrics = {
      connectedAt: now,
      lastActivity: now,
      lastHeartbeat: now,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      heartbeatsReceived: 0,
      heartbeatsMissed: 0,
    };

    // Add to static collection with duplicate handling
    if (SignalNode.signalNodes.has(id)) {
      console.warn(
        `⚠️  SignalNode with ID ${id} already exists, removing old instance`
      );
      const oldNode = SignalNode.signalNodes.get(id);
      oldNode?.forceDisconnect('duplicate_connection');
    }

    SignalNode.signalNodes.set(id, this);

    this.initialize();

    console.log(
      `✅ New SignalNode created - ID: ${this.id}, Connection: ${this.connectionId}`
    );
  }

  private initialize(): void {
    try {
      this.setupMessageHandlers();
      this.setupHeartbeat();
      this.setState(ConnectionState.CONNECTED);
      this.sendConnectionConfirmation();
    } catch (error) {
      console.error(`❌ Error initializing SignalNode ${this.id}:`, error);
      this.handleError(error as Error, 'initialization_error');
    }
  }

  private generateConnectionId(): string {
    return `${this.id}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  private setState(newState: ConnectionState): void {
    if (this.connectionState !== newState) {
      const oldState = this.connectionState;
      this.connectionState = newState;
      console.log(`📡 SignalNode ${this.id} state: ${oldState} -> ${newState}`);
      this.emit('stateChanged', { oldState, newState, nodeId: this.id });
    }
  }

  private setupHeartbeat(): void {
    this.clearHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (!this.isActive()) {
        return;
      }

      const timeSinceLastActivity = Date.now() - this.metrics.lastActivity;
      // const timeSinceLastHeartbeat = Date.now() - this.metrics.lastHeartbeat;

      // Check for stale connection
      if (timeSinceLastActivity > this.heartbeatTimeout) {
        console.warn(
          `💔 Connection ${this.id} is stale (${timeSinceLastActivity}ms since last activity)`
        );
        this.metrics.heartbeatsMissed++;

        if (this.metrics.heartbeatsMissed >= 3) {
          this.handleError(new Error('Heartbeat timeout'), 'heartbeat_timeout');
          return;
        }
      }

      // Send heartbeat
      try {
        if (
          this.sendMessage(MSA.Heartbeat, {
            timestamp: Date.now(),
            connectionId: this.connectionId,
          })
        ) {
          this.metrics.lastHeartbeat = Date.now();
        }
      } catch (error) {
        console.error(`❌ Error sending heartbeat to ${this.id}:`, error);
        this.handleError(error as Error, 'heartbeat_error');
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private setupMessageHandlers(): void {
    if (!this.call) {
      throw new Error('gRPC call is null');
    }

    // Handle incoming messages
    this.call.on('data', (message: MessageRequest) => {
      this.handleIncomingMessage(message);
    });

    // Handle connection events
    this.call.on('end', () => {
      console.log(`📤 Client ${this.id} ended the connection gracefully`);
      this.handleClientDisconnection('client_ended');
    });

    this.call.on('cancelled', () => {
      console.log(`🚫 Client ${this.id} cancelled the connection`);
      this.handleClientDisconnection('cancelled');
    });

    this.call.on('error', (error: Error) => {
      console.error(`💥 Stream error for client ${this.id}:`, error);
      this.handleError(error, 'stream_error');
    });

    this.call.on('close', () => {
      console.log(`🔌 Stream closed for client ${this.id}`);
      if (this.connectionState === ConnectionState.CONNECTED) {
        this.handleClientDisconnection('stream_closed');
      }
    });
  }

  private handleIncomingMessage(message: MessageRequest): void {
    try {
      this.metrics.messagesReceived++;
      this.metrics.lastActivity = Date.now();
      this.consecutiveErrors = 0; // Reset error count on successful message

      const { action, args } = message;

      if (!action) {
        console.warn(`⚠️  Received message without action from ${this.id}`);
        this.handleError(
          new Error('Missing action in message'),
          'protocol_error'
        );
        return;
      }

      console.log(`📨 Received message from ${this.id}: ${action}`);

      let parsedArgs: { [key: string]: unknown } = {};
      if (args) {
        try {
          parsedArgs = JSON.parse(args);
        } catch (parseError) {
          console.error(
            `❌ Failed to parse message args from ${this.id}:`,
            parseError
          );
          this.handleError(parseError as Error, 'parse_error');
          return;
        }
      }

      // Handle special system messages
      if (action === MSA.Heartbeat) {
        this.handleHeartbeat(parsedArgs);
        return;
      }

      // Find and execute handler
      const handler = this.actionHandlers[action as MSA];
      if (handler) {
        try {
          handler(parsedArgs);
        } catch (handlerError) {
          console.error(
            `❌ Error in handler for action ${action} from ${this.id}:`,
            handlerError
          );
          this.handleError(handlerError as Error, 'handler_error');
        }
      } else {
        console.warn(`⚠️  No handler for action ${action} from ${this.id}`);
        this.emit('unhandledMessage', {
          nodeId: this.id,
          action,
          args: parsedArgs,
        });
      }

      this.emit('messageReceived', {
        nodeId: this.id,
        action,
        args: parsedArgs,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`💥 Error handling message from ${this.id}:`, error);
      this.handleError(error as Error, 'message_handling_error');
    }
  }

  private handleHeartbeat(args: { [key: string]: unknown }): void {
    console.log(args);
    this.metrics.heartbeatsReceived++;
    this.metrics.heartbeatsMissed = 0; // Reset missed heartbeats

    // Respond to heartbeat
    this.sendMessage(MSA.HeartbeatAck, {
      timestamp: Date.now(),
      connectionId: this.connectionId,
      metrics: {
        messagesSent: this.metrics.messagesSent,
        messagesReceived: this.metrics.messagesReceived,
        uptime: Date.now() - this.metrics.connectedAt,
      },
    });
  }

  private handleError(error: Error, context: string): void {
    this.metrics.errors++;
    this.consecutiveErrors++;

    console.error(
      `💥 SignalNode ${this.id} error [${context}]:`,
      error.message
    );

    this.emit('error', {
      nodeId: this.id,
      error,
      context,
      consecutiveErrors: this.consecutiveErrors,
      timestamp: Date.now(),
    });

    // Disconnect if too many consecutive errors
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      console.error(
        `🚫 Too many consecutive errors (${this.consecutiveErrors}) for ${this.id}, disconnecting`
      );
      this.handleClientDisconnection('too_many_errors', error);
    }
  }

  private handleClientDisconnection(reason: string, error?: Error): void {
    if (this.isShuttingDown) {
      return; // Already handled
    }

    console.log(
      `🔌 Client ${this.id} disconnected (${reason})`,
      error ? `: ${error.message}` : ''
    );

    this.setState(ConnectionState.DISCONNECTED);
    this.cleanup();

    this.emit('disconnected', {
      nodeId: this.id,
      reason,
      error,
      metrics: this.getMetrics(),
      timestamp: Date.now(),
    });
  }

  private cleanup(): void {
    this.isShuttingDown = true;

    // Clear heartbeat
    this.clearHeartbeat();

    // Clear message queue
    this.messageQueue = [];

    // Remove from static collection
    SignalNode.signalNodes.delete(this.id);

    // Remove all listeners
    this.removeAllListeners();

    console.log(`🧹 Cleaned up SignalNode ${this.id}`);
  }

  private sendConnectionConfirmation(): void {
    this.sendMessage(MSA.Connected, {
      status: 'success',
      nodeId: this.id,
      connectionId: this.connectionId,
      message: 'Successfully connected to Media Signaling Server',
      timestamp: Date.now(),
      serverMetrics: grpcServer.getStats() || {},
    });
  }

  // Public methods
  sendMessage(action: MSA, args?: { [key: string]: unknown }): boolean {
    if (!this.isActive()) {
      console.warn(`⚠️  Cannot send message to ${this.id}: node is inactive`);
      return false;
    }

    if (!this.call) {
      console.warn(`⚠️  Cannot send message to ${this.id}: call is null`);
      return false;
    }

    try {
      const messageId = this.generateMessageId();
      const message = {
        action,
        args: JSON.stringify(args || {}),
      };

      this.call.write(message);

      this.metrics.messagesSent++;
      this.metrics.lastActivity = Date.now();
      grpcServer.incrementMessageStats(1, 0);

      console.log(`📤 Sent ${action} to ${this.id} (${messageId})`);

      this.emit('messageSent', {
        nodeId: this.id,
        action,
        args,
        messageId,
        timestamp: Date.now(),
      });

      return true;
    } catch (error) {
      console.error(`❌ Error sending message to ${this.id}:`, error);
      this.handleError(error as Error, 'send_message_error');
      return false;
    }
  }

  queueMessage(action: MSA, args?: { [key: string]: unknown }): boolean {
    if (this.messageQueue.length >= this.maxQueueSize) {
      console.warn(
        `⚠️  Message queue full for ${this.id}, dropping oldest message`
      );
      this.messageQueue.shift(); // Remove oldest message
    }

    const messageItem: MessageQueueItem = {
      action,
      args,
      timestamp: Date.now(),
      retries: 0,
      id: this.generateMessageId(),
    };

    this.messageQueue.push(messageItem);
    console.log(
      `📝 Queued message ${action} for ${this.id} (queue size: ${this.messageQueue.length})`
    );

    return true;
  }

  flushMessageQueue(): number {
    if (!this.isActive() || this.messageQueue.length === 0) {
      return 0;
    }

    let sentCount = 0;
    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach(messageItem => {
      if (this.sendMessage(messageItem.action, messageItem.args)) {
        sentCount++;
      } else {
        // Re-queue failed messages if under retry limit
        if (messageItem.retries < 3) {
          messageItem.retries++;
          this.messageQueue.push(messageItem);
        }
      }
    });

    if (sentCount > 0) {
      console.log(`📤 Flushed ${sentCount} queued messages for ${this.id}`);
    }

    return sentCount;
  }

  async gracefulDisconnect(
    reason: string = 'graceful_shutdown'
  ): Promise<void> {
    if (this.connectionState === ConnectionState.DISCONNECTED) {
      return;
    }

    console.log(`👋 Gracefully disconnecting ${this.id} (${reason})`);
    this.setState(ConnectionState.DISCONNECTING);

    try {
      // Send disconnect notification
      this.sendMessage(MSA.ServerShutdown, {
        message: 'Server is shutting down',
        reason,
        timestamp: Date.now(),
      });

      // Flush any remaining messages
      this.flushMessageQueue();

      // Wait a bit for messages to be sent
      await new Promise(resolve => setTimeout(resolve, 1000));

      // End the call gracefully
      if (this.call) {
        this.call.end();
      }
    } catch (error) {
      console.warn(
        `⚠️  Error during graceful disconnect for ${this.id}:`,
        error
      );
    } finally {
      this.handleClientDisconnection(reason);
    }
  }

  forceDisconnect(reason: string = 'force_disconnect'): void {
    console.log(`💥 Force disconnecting ${this.id} (${reason})`);

    try {
      if (this.call) {
        this.call.destroy();
      }
    } catch (error) {
      console.warn(`⚠️  Error during force disconnect for ${this.id}:`, error);
    } finally {
      this.handleClientDisconnection(reason);
    }
  }

  // Utility methods
  isActive(): boolean {
    return (
      this.connectionState === ConnectionState.CONNECTED && !this.isShuttingDown
    );
  }

  isStale(threshold: number = 300000): boolean {
    // 5 minutes default
    return Date.now() - this.metrics.lastActivity > threshold;
  }

  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  getState(): ConnectionState {
    return this.connectionState;
  }

  getUptime(): number {
    return Date.now() - this.metrics.connectedAt;
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  // Action handlers for different message types
  private actionHandlers: {
    [key in MSA]?: (args: { [key: string]: unknown }) => void;
  } = {
    [MSA.Connected]: args => {
      console.log(`✅ Connection confirmed from ${this.id}:`, args);
      this.emit('connectionConfirmed', { nodeId: this.id, args });
    },

    [MSA.Heartbeat]: args => {
      this.handleHeartbeat(args);
    },

    [MSA.HeartbeatAck]: args => {
      console.log(`💗 Heartbeat acknowledged by ${this.id}`, args);
      this.metrics.lastActivity = Date.now();
    },

    // Add more handlers as needed for your specific actions
  };

  // Static methods for managing all nodes
  static getNodes(): SignalNode[] {
    return Array.from(SignalNode.signalNodes.values());
  }

  static getNodeById(id: string): SignalNode | undefined {
    return SignalNode.signalNodes.get(id);
  }

  static getActiveNodes(): SignalNode[] {
    return Array.from(SignalNode.signalNodes.values()).filter(node =>
      node.isActive()
    );
  }

  static getNodeCount(): number {
    return SignalNode.signalNodes.size;
  }

  static getActiveNodeCount(): number {
    return this.getActiveNodes().length;
  }

  static async disconnectAll(): Promise<void> {
    console.log(
      `🛑 Disconnecting all ${SignalNode.signalNodes.size} signal nodes...`
    );

    const nodes = Array.from(SignalNode.signalNodes.values());
    const disconnectPromises = nodes.map(node =>
      node.gracefulDisconnect('disconnect_all').catch(error => {
        console.warn(`⚠️  Error disconnecting node ${node.id}:`, error);
        node.forceDisconnect('disconnect_all_force');
      })
    );

    await Promise.allSettled(disconnectPromises);
    SignalNode.signalNodes.clear();
    console.log('✅ All signal nodes disconnected');
  }

  static broadcastMessage(
    action: MSA,
    args?: { [key: string]: unknown },
    options?: {
      excludeIds?: string[];
      onlyActive?: boolean;
      queueIfUnavailable?: boolean;
    }
  ): { sent: number; queued: number; failed: number } {
    const opts = {
      excludeIds: [],
      onlyActive: true,
      queueIfUnavailable: false,
      ...options,
    };

    let nodes = Array.from(SignalNode.signalNodes.values());

    // Filter nodes based on options
    if (opts.excludeIds.length > 0) {
      nodes = nodes.filter(node => !opts.excludeIds!.includes(node.id));
    }

    if (opts.onlyActive) {
      nodes = nodes.filter(node => node.isActive());
    }

    let sent = 0;
    let queued = 0;
    let failed = 0;

    nodes.forEach(node => {
      if (node.isActive()) {
        if (node.sendMessage(action, args)) {
          sent++;
        } else {
          failed++;
        }
      } else if (opts.queueIfUnavailable) {
        if (node.queueMessage(action, args)) {
          queued++;
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    });

    console.log(
      `📢 Broadcast ${action}: ${sent} sent, ${queued} queued, ${failed} failed`
    );
    return { sent, queued, failed };
  }

  static getConnectionStats(): {
    total: number;
    active: number;
    connecting: number;
    disconnecting: number;
    disconnected: number;
    error: number;
  } {
    const nodes = Array.from(SignalNode.signalNodes.values());

    return {
      total: nodes.length,
      active: nodes.filter(n => n.connectionState === ConnectionState.CONNECTED)
        .length,
      connecting: nodes.filter(
        n => n.connectionState === ConnectionState.CONNECTING
      ).length,
      disconnecting: nodes.filter(
        n => n.connectionState === ConnectionState.DISCONNECTING
      ).length,
      disconnected: nodes.filter(
        n => n.connectionState === ConnectionState.DISCONNECTED
      ).length,
      error: nodes.filter(n => n.connectionState === ConnectionState.ERROR)
        .length,
    };
  }

  static getDetailedMetrics(): {
    totalNodes: number;
    activeNodes: number;
    totalMessagesSent: number;
    totalMessagesReceived: number;
    totalErrors: number;
    avgUptime: number;
    nodes: Array<{
      id: string;
      connectionId: string;
      state: ConnectionState;
      metrics: ConnectionMetrics;
      uptime: number;
      queueSize: number;
    }>;
  } {
    const nodes = Array.from(SignalNode.signalNodes.values());
    const activeNodes = nodes.filter(n => n.isActive());

    return {
      totalNodes: nodes.length,
      activeNodes: activeNodes.length,
      totalMessagesSent: nodes.reduce(
        (sum, node) => sum + node.metrics.messagesSent,
        0
      ),
      totalMessagesReceived: nodes.reduce(
        (sum, node) => sum + node.metrics.messagesReceived,
        0
      ),
      totalErrors: nodes.reduce((sum, node) => sum + node.metrics.errors, 0),
      avgUptime:
        nodes.length > 0
          ? nodes.reduce((sum, node) => sum + node.getUptime(), 0) /
            nodes.length
          : 0,
      nodes: nodes.map(node => ({
        id: node.id,
        connectionId: node.connectionId,
        state: node.connectionState,
        metrics: node.getMetrics(),
        uptime: node.getUptime(),
        queueSize: node.getQueueSize(),
      })),
    };
  }
}

export default SignalNode;
export { ConnectionState, SignalNode };
