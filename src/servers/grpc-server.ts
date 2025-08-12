import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { ProtoGrpcType } from '../protos/media-signaling';

class GrpcServer {
  private static instance: GrpcServer | null = null;
  private server: grpc.Server;
  private connections: Map<string, string>;

  private constructor() {
    this.server = new grpc.Server();
    this.connections = new Map();
    this.setup();
  }

  static getInstance(): GrpcServer {
    if (!GrpcServer.instance) {
      GrpcServer.instance = new GrpcServer();
    }

    return GrpcServer.instance;
  }

  async start(port: number = 50051): Promise<void> {
    try {
      this.server.bindAsync(
        `0.0.0.0:${port}`,
        grpc.ServerCredentials.createInsecure(),
        () => {
          // if (error) {
          //   console.log(error);
          //   throw error;
          // }
          this.server.start();
        }
      );
    } catch (error) {
      console.error(error);
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

    const mediaSignaling =
      protoDescriptor.media_signaling_package.MediaSignaling;

    this.server.addService(mediaSignaling.service, {
      HealthCheck: this.healthCheck.bind(this),
    });
  }

  // Health check implementation
  private healthCheck(
    call: grpc.ServerUnaryCall<unknown, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    console.log('call', call.request);
    callback(null, {
      status: 1, // SERVING
    });
  }
}

export const grpcServer = GrpcServer.getInstance();
