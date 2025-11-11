import EventEmitter from 'events';
import * as grpc from '@grpc/grpc-js';
import { types as mediasoupTypes } from 'mediasoup';

import { Actions } from '../types/actions';
import { MessageRequest } from '../protos/gen/mediaSignalingPackage/MessageRequest';
import { MessageResponse } from '../protos/gen/mediaSignalingPackage/MessageResponse';
import { mediaSoupServer } from '../servers/mediasoup-server';
import { ValidationSchema } from '../lib/schema';
import Room from './room';
import Peer from './peer';
import {
  ResponseData,
  ConnectionState,
  PendingRequest,
  ProducerSource,
  TransportKind,
} from '../types';
import { parseArguments as parseArguments } from '../lib/utils';

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
  private pendingRequests: Map<string, PendingRequest>;

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
      if (!action) return;

      const parsedArgs = parseArguments(args);

      if (requestId?.length) {
        console.log('Got a request expecting response');
        const pendingRequest = this.pendingRequests.get(requestId);
        if (pendingRequest) {
          // this means this instance initiated this request for response .
          // resolve and return
          if (parsedArgs.status === 'error') {
            console.log(action, 'pending request Returned error');
            pendingRequest.reject(parsedArgs.error as Error);
          } else {
            console.log(action, 'pending request Returned success');
            const response = parsedArgs.resolve as ResponseData;
            pendingRequest.resolve(response);
          }
          this.pendingRequests.delete(requestId);
          return;
        }
      }

      console.log(`Received message from ${this.id}: ${action}`);

      // Handle special system messages
      if (action === Actions.Heartbeat) {
        this.handleHeartbeat(parsedArgs);
        return;
      }

      // Find and execute handler
      const handler = this.actionHandlers[action as Actions];
      if (handler) {
        try {
          handler(parsedArgs, requestId);
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
      routerRtpCapabilities: rtpCapabilities,
    });
  }

  // Public methods
  sendMessage(action: Actions, args?: { [key: string]: unknown }): void {
    if (!this.isActive()) {
      console.warn(`Cannot send message to ${this.id}: node is inactive`);
      return;
    }

    if (!this.call) {
      throw `Cannot send message to ${this.id}: call is null`;
    }
    const message = {
      action,
      args: JSON.stringify(args || {}),
    };

    this.call.write(message);
  }

  async sendMessageForResponse(
    action: Actions,
    args?: { [key: string]: unknown }
  ): Promise<ResponseData> {
    if (!this.call) {
      throw `Cannot send message to MediaNode ${this.id}: not connected`;
    }
    const requestId = crypto.randomUUID();
    const message: MessageRequest = {
      action,
      args: JSON.stringify(args || {}),
      requestId,
    };

    return new Promise<ResponseData>((resolve, reject) => {
      if (this.call) {
        this.pendingRequests.set(requestId, {
          resolve,
          reject,
        });
        this.call.write(message);
      }
    });
  }

  sendResponse(
    action: Actions,
    requestId: string,
    response: { [key: string]: unknown }
  ): void {
    if (!this.call) {
      throw `Cannot send message to MediaNode ${this.id}: not connected`;
    }
    const message: MessageRequest = {
      action,
      requestId,
      args: JSON.stringify({
        status: 'success',
        response,
      }),
    };

    this.call.write(message);
  }

  sendError(action: Actions, requestId: string, error: Error | unknown): void {
    if (!this.call) {
      throw `Cannot send message to MediaNode ${this.id}: not connected`;
    }
    const message: MessageRequest = {
      action,
      requestId,
      args: JSON.stringify({
        status: 'error',
        error,
      }),
    };

    this.call.write(message);
  }

  async gracefulDisconnect(
    reason: string = 'graceful_shutdown'
  ): Promise<void> {
    if (this.connectionState === ConnectionState.Disconnected) {
      return;
    }

    console.log(`Gracefully disconnecting ${this.id} (${reason})`);
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
      console.warn(`Error during graceful disconnect for ${this.id}:`, error);
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
      console.warn(`Error during force disconnect for ${this.id}:`, error);
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
      `Disconnecting all ${SignalNode.signalNodes.size} signal nodes...`
    );

    const nodes = Array.from(SignalNode.signalNodes.values());
    const disconnectPromises = nodes.map(node =>
      node.gracefulDisconnect('disconnect_all').catch(error => {
        console.warn(`Error disconnecting node ${node.id}:`, error);
        node.forceDisconnect('disconnect_all_force');
      })
    );

    await Promise.allSettled(disconnectPromises);
    SignalNode.signalNodes.clear();
    console.log('All signal nodes disconnected');
  }

  static broadcastMessage(): void {}

  private async createTransport(
    router: mediasoupTypes.Router,
    type: TransportKind = 'consumer'
  ): Promise<mediasoupTypes.WebRtcTransport> {
    if (!router.appData.webRtcServer) throw 'Webrtc server not found';
    const webRtcServer = router.appData
      .webRtcServer as mediasoupTypes.WebRtcServer;
    const transport = await router.createWebRtcTransport({
      webRtcServer,
      appData: {
        isConsumer: type === 'consumer',
        isProducer: type === 'producer',
      },
    });

    return transport;
  }

  private async createConsumer({
    consumingPeer,
    producerPeerId,
    producer,
    room,
  }: {
    consumingPeer: Peer;
    producerPeerId: string;
    producer: mediasoupTypes.Producer;
    room: Room;
  }): Promise<void> {
    try {
      if (
        !consumingPeer.getRouter().canConsume({
          producerId: producer.id,
          rtpCapabilities: consumingPeer.getDeviceRTPCapabilities(),
        })
      ) {
        return console.log(`Can not consmer with producerId - ${producer.id}`);
      }
      // GET CONSUMER PEER CONSUMER TRANSPORT
      const transport = consumingPeer
        .getTransports()
        .find(tp => tp.appData.isConsumer === true);

      if (!transport) return;

      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: consumingPeer.getDeviceRTPCapabilities(),
        paused: true,
        appData: producer.appData,
      });
      // Find out on this
      if (producer.kind === 'audio' && producer.appData.source === 'mic')
        await consumer.setPriority(255);

      consumingPeer.addConsumer(consumer);

      const options = {
        roomId: room.roomId,
        peerId: consumingPeer.id,
        peerType: consumingPeer.type,
        consumerId: consumer.id,
        producerPeerId,
        producerSource: producer.appData.source,
        fromProducer: true,
      };

      consumer.observer.on('close', () => {
        consumingPeer.removeConsumer(consumer.id);
        consumingPeer.sendMessage(Actions.ConsumerClosed, options);
      });

      consumer.on('producerpause', () => {
        consumingPeer.sendMessage(Actions.ConsumerPaused, options);
      });

      consumer.on('producerresume', () => {
        consumingPeer.sendMessage(Actions.ConsumerResumed, options);
      });

      consumingPeer
        .sendMessageForResponse(Actions.ConsumerCreated, {
          peerId: consumingPeer.id,
          peerType: consumingPeer.type,
          roomId: room.roomId,
          producerPeerId: producerPeerId,
          producerId: producer.id,
          transportId: transport.id,
          producerSource: producer.appData.source,
          id: consumer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          type: consumer.type,
          producerPaused: consumer.producerPaused,

          appData: {
            ...producer.appData,
            producerPeerId,
            transportId: transport.id,
          },
        })
        .then(async res => {
          console.log('CreateConsumer Response -> resolved request', res);
          // if (producer.appData.source === 'camera') return;
          await consumer.resume();
          console.log('resume consumer');
        })
        .catch(error => {
          console.log('CreateConsumer | Resume Consumer', error);
        });
      console.log('Create consumer ---', producer.appData.source);
    } catch (error) {
      // callback('createConsumersForExistingPeers fialed')
      console.error('createConsumer fialed ', { error });
    }
  }

  // Action handlers for different message types
  private actionHandlers: {
    [key in Actions]?: (
      args: { [key: string]: unknown },
      requestId?: string
    ) => void;
  } = {
    [Actions.Connected]: args => {
      console.log(`Connection confirmed from ${this.id}:`, args);
      this.emit('connectionConfirmed', { nodeId: this.id, args });
    },

    [Actions.Ping]: (args, requestId) => {
      console.log('Signal Server Pinged Mediaserver requestId', requestId);
      this.call.write({
        action: Actions.Pong,
        args: JSON.stringify(args),
        requestId,
      });
    },

    [Actions.HeartbeatAck]: args => {
      console.log(`Heartbeat acknowledged by ${this.id}`, args);
    },

    // Add more handlers as needed for your specific actions

    [Actions.CreatePeer]: async (args, requestId) => {
      try {
        if (!requestId) throw 'Request Id requested';

        const data = ValidationSchema.createPeer.parse(args);
        const { roomId, peerId, peerType, deviceRtpCapabilities } = data;
        const room = Room.getRoom(roomId) ?? (await Room.create(roomId));

        const router = await room.assignRouterToPeer();
        if (!router) throw 'Router not assigned to peer';
        const peer = new Peer({
          id: peerId,
          roomId,
          router,
          deviceRtpCapabilities,
          signalnode: this,
          type: peerType,
        });

        room.addPeer(peer);
        this.sendResponse(Actions.CreatePeer, requestId, {
          routerId: router.id,
        });
      } catch (error) {
        console.log(error);
        this.sendError(Actions.CreatePeer, requestId as string, error);
      }
    },

    [Actions.ClosePeer]: async args => {
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

        if (!peer)
          throw 'Failed to create webrtc transport: Peer/room not found';

        const producerTransport = await this.createTransport(
          peer.getRouter(),
          'producer'
        );
        const consumerTransport = await this.createTransport(
          peer.getRouter(),
          'consumer'
        );

        peer.addTransport(producerTransport);
        peer.addTransport(consumerTransport);

        this.sendResponse(Actions.CreateWebrtcTransports, requestId, {
          sendTransportParams: {
            id: producerTransport.id,
            iceParameters: producerTransport.iceParameters,
            iceCandidates: producerTransport.iceCandidates,
            dtlsParameters: producerTransport.dtlsParameters,
            sctpParameters: producerTransport.sctpParameters,
          },
          recvTransportParams: {
            id: consumerTransport.id,
            iceParameters: consumerTransport.iceParameters,
            iceCandidates: consumerTransport.iceCandidates,
            dtlsParameters: consumerTransport.dtlsParameters,
            sctpParameters: consumerTransport.sctpParameters,
          },
        });
        console.log('Close Peer');
      } catch (error) {
        console.log(error);
        this.sendError(Actions.CreatePeer, requestId as string, error);
      }
    },

    [Actions.ConnectWebrtcTransports]: async args => {
      try {
        const data = ValidationSchema.connectWebRtcTransport.parse(args);
        const { roomId, peerId, transportId, dtlsParameters } = data;
        const room = Room.getRoom(roomId);
        const peer = room?.getPeer(peerId);

        if (!peer)
          throw 'Failed to create webrtc transport: Peer/room not found';
        const transport = peer.getTransport(transportId);
        if (!transport) throw 'Transport was not found';
        transport.connect({ dtlsParameters });
      } catch (error) {
        console.log(error);
      }
    },

    [Actions.CreateConsumersOfAllProducers]: async args => {
      try {
        const data = ValidationSchema.roomIdPeerId.parse(args);
        const { roomId, peerId } = data;
        const room = Room.getRoom(roomId);
        const peer = room?.getPeer(peerId);
        if (!room || !peer)
          throw 'Failed to create webrtc transport: Peer/room not found';
        const existingPeers = room.getPeers();

        // create consumer from producers of existing peers
        existingPeers.forEach(existingPeer => {
          // ingore the peer that requested this
          if (existingPeer.id === peerId) return;
          const peerProducers = existingPeer.getProducers();
          peerProducers.forEach(producer => {
            this.createConsumer({
              consumingPeer: peer,
              producerPeerId: existingPeer.id,
              producer: producer,
              room,
            }).catch(error => {
              console.log(error);
            });
          });
        });

        // create consumer from producer in connected media
        const medianodes = room.getMediaNodes();
        medianodes.forEach(medianode => {
          const producers = medianode.getProducers();
          producers.forEach(producer => {
            room
              .createPipeConsumer({
                consumingMediaNode: medianode,
                producer: producer,
                producerPeerId: producer.appData.peerId as string,
              })
              .catch(error => {
                console.error('create pipeConsumer fialed', { error });
              });
          });
        });
      } catch (error) {
        console.log(error);
      }
    },

    [Actions.CreateProducer]: async (args, requestId) => {
      try {
        if (!requestId) throw 'Request Id requested';

        const data = ValidationSchema.createProducer.parse(args);
        const { roomId, peerId, rtpParameters, kind, transportId, appData } =
          data;

        const room = Room.getRoom(roomId);
        const peer = room?.getPeer(peerId);
        if (!room || !peer)
          throw 'Failed to create webrtc transport: Peer/room not found';

        const source = appData.source as ProducerSource;
        peer.closeProducersBySource({ room, source });

        const transport = peer.getTransport(transportId);
        if (!transport) throw 'Transport not found';
        const producer = await transport.produce({
          kind,
          rtpParameters,
          appData: { ...appData, peerId },
        });
        peer.addProducer(producer);

        this.sendResponse(Actions.CreateProducer, requestId, {
          producerId: producer.id,
        });

        // Pipe Producer From This Router to other routers
        const routersToPipeTo = room.getRoutersToPipeTo(peer.getRouter());
        routersToPipeTo.forEach(router => {
          peer
            .pipeToRouter({
              router,
              producerId: producer.id,
            })
            .catch(error => console.log(error));
        });

        // Create server-side consumer for each existing peers
        const existingPeers = room.getPeers();
        existingPeers.forEach(consumingPeer => {
          if (consumingPeer.id === peerId)
            return console.log('You are the one producing');
          this.createConsumer({
            consumingPeer,
            producer: producer,
            room,
            producerPeerId: producer.appData.peerId as string,
          }).catch(error => {
            console.error('create pipeConsumer fialed', { error });
          });
        });

        // create PipeConsumer for all connected MediaNode
        const medianodes = room.getMediaNodes();
        medianodes.forEach(medianode => {
          room
            .createPipeConsumer({
              producer,
              producerPeerId: peer.id,
              consumingMediaNode: medianode,
            })
            .catch(error => {
              console.error('newPipeconsumer createPipeConsumer failed', error);
            });
        });

        if (producer.kind === 'audio' && appData.source === 'mic') {
          const audioLevelObserver = room.audioLevelObservers.get(
            peer.getRouter().id
          );
          if (audioLevelObserver) {
            audioLevelObserver.addProducer({ producerId: producer.id });
          }
        }
      } catch (error) {
        console.log(error);
        this.sendError(Actions.CreateProducer, requestId as string, error);
      }
    },

    [Actions.CloseProducer]: args => {
      try {
        const data = ValidationSchema.manageProducer.parse(args);
        const { peerId, roomId, source } = data;
        const room = Room.getRoom(roomId);
        const peer = room?.getPeer(peerId);

        if (!room || !peer)
          throw 'Failed to create webrtc transport: Peer/room not found';

        peer.closeProducersBySource({ room, source });
      } catch (error) {
        console.log(error);
      }
    },

    [Actions.PauseProducer]: args => {
      try {
        const data = ValidationSchema.manageProducer.parse(args);
        const { peerId, roomId, source } = data;
        const room = Room.getRoom(roomId);
        const peer = room?.getPeer(peerId);

        if (!room || !peer)
          throw 'Failed to create webrtc transport: Peer/room not found';

        const producers = peer.getProducersBySource(source);
        producers.forEach(producer => {
          producer.pause().catch(error => {
            console.log(error);
          });
        });
      } catch (error) {
        console.log(error);
      }
    },

    [Actions.ResumeProducer]: args => {
      try {
        const data = ValidationSchema.manageProducer.parse(args);
        const { peerId, roomId, producerId } = data;
        const room = Room.getRoom(roomId);
        const peer = room?.getPeer(peerId);

        if (!room || !peer)
          throw 'Failed to create webrtc transport: Peer/room not found';

        const producer = peer.getProducer(producerId);
        producer?.resume();
      } catch (error) {
        console.log(error);
      }
    },

    [Actions.PauseConsumer]: args => {
      console.log('PauseConsumer', args);
    },

    [Actions.ResumeConsumer]: args => {
      console.log('ResumeConsumer', args);
    },

    [Actions.RestartIce]: async (args, requestId) => {
      try {
        if (!requestId) throw 'Require request id';
        const data = ValidationSchema.restartIce.parse(args);
        const { roomId, peerId, transportId } = data;

        const room = Room.getRoom(roomId);
        const peer = room?.getPeer(peerId);

        if (!room || !peer)
          throw 'Failed to create webrtc transport: Peer/room not found';
        const transport = peer.getTransport(transportId);
        if (!transport) return;
        const iceParameters = await transport.restartIce();
        this.sendResponse(Actions.RestartIce, requestId, {
          iceParameters,
        });
      } catch (error) {
        console.log(error);
        this.sendError(Actions.RestartIce, requestId as string, error);
      }
    },
  };
}

export default SignalNode;

export { ConnectionState, SignalNode };
