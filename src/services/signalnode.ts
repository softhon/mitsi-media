import EventEmitter from 'events';
import * as grpc from '@grpc/grpc-js';

import { Actions } from '../types/actions';
import { MessageRequest } from '../protos/gen/mediaSignalingPackage/MessageRequest';
import { MessageResponse } from '../protos/gen/mediaSignalingPackage/MessageResponse';
import { grpcServer } from '../servers/grpc-server';
import { mediaSoupServer } from '../servers/mediasoup-server';
import { ValidationSchema } from '../lib/schema';
import Room from './room';
import Peer from './peer';
import { ConnectionState } from '../types';

class SignalNode extends EventEmitter {
  id: string;
  connectionId: string;
  call: grpc.ServerDuplexStream<MessageRequest, MessageResponse>;
  metadata: grpc.Metadata;
  private connectionState: ConnectionState;
  private lastHeartbeat: number;
  private heartbeatInterval?: NodeJS.Timeout;
  private heartbeatTimeout: number = 60000;
  private isShuttingDown: boolean = false;
  private pendingRequests: Map<string, (response: MessageResponse) => void>;

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
    this.connectionState = ConnectionState.Connecting;
    this.pendingRequests = new Map();

    this.lastHeartbeat = Date.now();

    // Add to static collection with duplicate handling
    if (SignalNode.signalNodes.has(id)) {
      const oldNode = SignalNode.signalNodes.get(id);
      oldNode?.forceDisconnect('duplicate_connection');
    }

    SignalNode.signalNodes.set(id, this);

    this.initialize();

    console.log(
      `New SignalNode created - ID: ${this.id}, Connection: ${this.connectionId}`
    );
  }

  private initialize(): void {
    try {
      this.setupMessageHandlers();
      this.setupHeartbeat();
      this.setState(ConnectionState.Connected);
      this.sendConnectionConfirmation();
    } catch (error) {
      console.error(`Error initializing SignalNode ${this.id}:`, error);
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
      console.log(`SignalNode ${this.id} state: ${oldState} -> ${newState}`);
      this.emit('stateChanged', { oldState, newState, nodeId: this.id });
    }
  }

  private setupHeartbeat(): void {}

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
      console.log(`client ${this.id} ended the connection gracefully`);
      this.handleClientDisconnection('client_ended');
    });

    this.call.on('cancelled', () => {
      console.log(`Client ${this.id} cancelled the connection`);
      this.handleClientDisconnection('cancelled');
    });

    this.call.on('error', (error: Error) => {
      console.error(`Stream error for client ${this.id}:`, error);
      this.handleError(error, 'stream_error');
    });

    this.call.on('close', () => {
      console.log(`Stream closed for client ${this.id}`);
      if (this.connectionState === ConnectionState.Connected) {
        this.handleClientDisconnection('stream_closed');
      }
    });
  }

  private handleIncomingMessage(message: MessageRequest): void {
    try {
      const { action, args, requestId } = message;

      if (requestId?.length) {
        const resolver = this.pendingRequests.get(requestId);
        if (resolver) {
          // this means this instance initiated this request for response .
          // resolve and return
          resolver(message);
          this.pendingRequests.delete(requestId);
          return;
        }
      }

      if (!action) {
        console.warn(`⚠️  Received message without action from ${this.id}`);
        this.handleError(
          new Error('Missing action in message'),
          'protocol_error'
        );
        return;
      }

      console.log(`Received message from ${this.id}: ${action}`);

      let parsedArgs: { [key: string]: unknown } = {};
      if (args) {
        try {
          parsedArgs = JSON.parse(args);
        } catch (parseError) {
          console.error(
            `Failed to parse message args from ${this.id}:`,
            parseError
          );
          this.handleError(parseError as Error, 'parse_error');
          return;
        }
      }

      // Handle special system messages
      if (action === Actions.Heartbeat) {
        this.handleHeartbeat(parsedArgs);
        return;
      }

      // Find and execute handler
      const handler = this.actionHandlers[action as Actions];
      if (handler) {
        try {
          handler(parsedArgs);
        } catch (handlerError) {
          console.error(
            ` Error in handler for action ${action} from ${this.id}:`,
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
      console.error(`Error handling message from ${this.id}:`, error);
      this.handleError(error as Error, 'message_handling_error');
    }
  }

  private handleHeartbeat(args: { [key: string]: unknown }): void {
    console.log(args);

    // Respond to heartbeat
    this.sendMessage(Actions.HeartbeatAck, {
      timestamp: Date.now(),
      connectionId: this.connectionId,
    });
  }

  private handleError(error: Error, context: string): void {
    console.error(`SignalNode ${this.id} error [${context}]:`, error.message);

    this.emit('error', {
      nodeId: this.id,
      error,
      context,
      timestamp: Date.now(),
    });
  }

  private handleClientDisconnection(reason: string, error?: Error): void {
    if (this.isShuttingDown) {
      return; // Already handled
    }
    this.setState(ConnectionState.Disconnected);
    this.cleanup();

    this.emit('disconnected', {
      nodeId: this.id,
      reason,
      error,
      timestamp: Date.now(),
    });
  }

  private cleanup(): void {
    this.isShuttingDown = true;

    // Clear heartbeat
    this.clearHeartbeat();

    // Remove from static collection
    SignalNode.signalNodes.delete(this.id);

    // Remove all listeners
    this.removeAllListeners();

    console.log(`Cleaned up SignalNode ${this.id}`);
  }

  private async sendConnectionConfirmation(): Promise<void> {
    const rtpCapabilities = await mediaSoupServer.getRouterRtpCapabilities();
    this.sendMessage(Actions.Connected, {
      status: 'success',
      nodeId: this.id,
      connectionId: this.connectionId,
      message: 'Successfully connected to Media Signaling Server',
      timestamp: Date.now(),
      serverMetrics: grpcServer.getStats() || {},
      routerRtpCapabilities: rtpCapabilities,
    });
  }

  // Public methods
  sendMessage(action: Actions, args?: { [key: string]: unknown }): boolean {
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

      grpcServer.incrementMessageStats(1, 0);

      console.log(`Sent ${action} to ${this.id} (${messageId})`);

      return true;
    } catch (error) {
      console.error(`Error sending message to ${this.id}:`, error);
      this.handleError(error as Error, 'send_message_error');
      return false;
    }
  }

  async sendMessageForResponse(
    action: Actions,
    args?: { [key: string]: unknown }
  ): Promise<MessageResponse | null> {
    if (!this.call) {
      console.warn(
        `⚠️  Cannot send message to MediaNode ${this.id}: not connected`
      );
      return null;
    }

    try {
      const requestId = crypto.randomUUID();
      const message: MessageRequest = {
        action,
        args: JSON.stringify(args || {}),
        requestId,
      };

      return new Promise<MessageResponse>(resolve => {
        if (this.call) {
          this.pendingRequests.set(requestId, resolve); // save resolve
          this.call.write(message);
        }
      });
    } catch (error) {
      console.error(`❌ Error sending message to MediaNode ${this.id}:`, error);
      throw error;
    }
  }
  sendResponse(
    action: Actions,
    requestId: string,
    args: { [key: string]: unknown }
  ): void {
    if (!this.call) {
      console.warn(
        `⚠️Cannot send message to MediaNode ${this.id}: not connected`
      );
      return;
    }

    try {
      const message: MessageRequest = {
        action,
        args: JSON.stringify(args || {}),
        requestId,
      };

      this.call.write(message);
    } catch (error) {
      console.error(`❌ Error sending message to MediaNode ${this.id}:`, error);
      throw error;
    }
  }

  async gracefulDisconnect(
    reason: string = 'graceful_shutdown'
  ): Promise<void> {
    if (this.connectionState === ConnectionState.Disconnected) {
      return;
    }

    console.log(`👋 Gracefully disconnecting ${this.id} (${reason})`);
    this.setState(ConnectionState.Disconnecting);

    try {
      // Send disconnect notification
      this.sendMessage(Actions.ServerShutdown, {
        message: 'Server is shutting down',
        reason,
        timestamp: Date.now(),
      });

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
    console.log(`Force disconnecting ${this.id} (${reason})`);

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
      this.connectionState === ConnectionState.Connected && !this.isShuttingDown
    );
  }

  getState(): ConnectionState {
    return this.connectionState;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

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

  static broadcastMessage(): void {}

  // Action handlers for different message types
  private actionHandlers: {
    [key in Actions]?: (
      args: { [key: string]: unknown },
      requestId?: string
    ) => void;
  } = {
    [Actions.Connected]: args => {
      console.log(`✅ Connection confirmed from ${this.id}:`, args);
      this.emit('connectionConfirmed', { nodeId: this.id, args });
    },

    [Actions.Ping]: (args, requestId) => {
      console.log('Signal Server Pinged Mediaserver');
      this.call.write({
        action: Actions.Pong,
        args: JSON.stringify(args),
        requestId,
      });
    },

    [Actions.HeartbeatAck]: args => {
      console.log(`💗 Heartbeat acknowledged by ${this.id}`, args);
    },

    // Add more handlers as needed for your specific actions

    [Actions.CreatePeer]: async (args, requestId) => {
      try {
        if (!requestId) throw 'Request Id requested';

        const data = ValidationSchema.createPeer.parse(args);
        const { roomId, peerId, peerType, rtpCapabilities } = data;
        const room = Room.getRoom(roomId) ?? (await Room.create(roomId));

        const router = await room.assignRouterToPeer();
        if (!router) throw 'Router not assigned to peer';
        const peer = new Peer({
          id: peerId,
          roomId,
          router,
          rtpCapabilities,
          signalNodeId: this.id,
          type: peerType,
        });

        room.addPeer(peer);
        this.sendResponse(Actions.CreatePeer, requestId, {
          routerId: router.id,
        });
      } catch (error) {
        console.log(error);
      }
    },

    [Actions.Close]: async args => {
      try {
        const data = ValidationSchema.roomIdPeerId.parse(args);
        const { roomId, peerId } = data;
        const room = Room.getRoom(roomId);
        const peer = room?.getPeer(peerId);
        peer?.close();

        console.log('Close Peer');
      } catch (error) {
        console.log(error);
      }
    },

    [Actions.CreateWebrtcTransports]: async (args, requestId) => {
      try {
        if (!requestId) throw 'Request Id requested';

        const data = ValidationSchema.roomIdPeerId.parse(args);
        const { roomId, peerId } = data;
        const room = Room.getRoom(roomId);
        const peer = room?.getPeer(peerId);
        peer?.close();

        console.log('Close Peer');
      } catch (error) {
        console.log(error);
      }
    },
  };
}

export default SignalNode;

export { ConnectionState, SignalNode };
