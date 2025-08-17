import EventEmitter from 'events';
import * as grpc from '@grpc/grpc-js';

import { MediaSignalingActions as MSA } from '../types/actions';
import { MessageRequest } from '../protos/gen/mediaSignalingPackage/MessageRequest';
import { MessageResponse } from '../protos/gen/mediaSignalingPackage/MessageResponse';

class SignalNode extends EventEmitter {
  id: string; // client Id;
  call: grpc.ServerDuplexStream<MessageRequest, MessageResponse>;
  metadata: grpc.Metadata;
  connectedAt: number;
  lastActivity: number;
  isActive: boolean;
  heartbeatInterval?: NodeJS.Timeout;

  static signalNodes: Map<string, SignalNode>;

  constructor({
    id,
    call,
  }: {
    id: string;
    call: grpc.ServerDuplexStream<MessageRequest, MessageResponse>;
  }) {
    super();
    this.id = id;
    this.call = call;
    this.metadata = call.metadata;
    this.connectedAt = Date.now();
    this.lastActivity = Date.now();
    this.isActive = true;

    SignalNode.signalNodes.set(id, this);
    this.handleMessages();
    this.setupHeartbeat();
    console.log('new grpc connection - signalnode connected nodeId', this.id);
  }

  static getNodes(): SignalNode[] {
    return Array.from(SignalNode.signalNodes.values());
  }

  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.isActive) {
        return;
      }
      const timeSinceLastActivity = Date.now() - this.lastActivity;
      if (timeSinceLastActivity > 60000) {
        console.log(`Connection ${this.id} is stale, removing...`);
        this.handleClientDisconnection('stale_connection');
        return;
      }

      // Send heartbeat
      this.sendMessage(MSA.Heartbeat);
    }, 30000); // Send heartbeat every 30 seconds
  }

  private handleMessages(): void {
    // Handle incoming messages

    this.call.on('data', (message: MessageRequest) => {
      const { action, args } = message;
      if (!action) return;
      const handler = this.actionHandlers[action as MSA];

      if (handler) handler(args && JSON.parse(args));
    });

    // Handle client disconnection
    this.call.on('end', () => {
      console.log(`Client ${this.id} ended the connection`);
      this.handleClientDisconnection('client_ended');
    });

    // Handle call cancellation
    this.call.on('cancelled', () => {
      console.log(`Client ${this.id} cancelled the connection`);
      this.handleClientDisconnection('cancelled');
    });

    this.sendMessage(MSA.Connected, {
      status: 'success',
      nodeId: this.id,
      message: 'Successfully connected to Media Signaling Server',
    });
  }

  private handleClientDisconnection(reason: string, error?: Error): void {
    console.log(`🔌 Client ${this.id} disconnected (${reason}) -  `, error);

    // Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Mark as inactive
    this.isActive = false;

    // Remove from connections
    // this.connections.delete(clientId);
    // this.stats.activeConnections = Math.max(
    //   0,
    //   this.stats.activeConnections - 1
    // );
  }

  sendMessage(action: MSA, args?: { [key: string]: unknown }): boolean {
    if (!this.isActive) {
      console.warn(
        `⚠️  Cannot send message to client ${this.id}: signalNode is inactive`
      );
      return false;
    }
    try {
      this.call.write({
        action,
        args: JSON.stringify(args || {}),
      });
      this.lastActivity = Date.now();
      return true;
    } catch (error) {
      console.error(` Error sending message to client ${this.id}:`, error);
      return false;
    }
  }

  private actionHandlers: {
    [key in MSA]?: (args: { [key: string]: unknown }) => void;
  } = {
    connected: args => {
      console.log(args);
    },
  };
}

export default SignalNode;
