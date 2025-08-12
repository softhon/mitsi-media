// Original file: src/protos/media-signaling.proto

import type * as grpc from '@grpc/grpc-js';
import type { MethodDefinition } from '@grpc/proto-loader';
import type {
  HealthCheckRequest as _mediaSignalingPackage_HealthCheckRequest,
  HealthCheckRequest__Output as _mediaSignalingPackage_HealthCheckRequest__Output,
} from './HealthCheckRequest';
import type {
  HealthCheckResponse as _mediaSignalingPackage_HealthCheckResponse,
  HealthCheckResponse__Output as _mediaSignalingPackage_HealthCheckResponse__Output,
} from './HealthCheckResponse';

export interface MediaSignalingServiceClient extends grpc.Client {
  HealthCheck(
    argument: _mediaSignalingPackage_HealthCheckRequest,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<_mediaSignalingPackage_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  HealthCheck(
    argument: _mediaSignalingPackage_HealthCheckRequest,
    metadata: grpc.Metadata,
    callback: grpc.requestCallback<_mediaSignalingPackage_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  HealthCheck(
    argument: _mediaSignalingPackage_HealthCheckRequest,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<_mediaSignalingPackage_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  HealthCheck(
    argument: _mediaSignalingPackage_HealthCheckRequest,
    callback: grpc.requestCallback<_mediaSignalingPackage_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  healthCheck(
    argument: _mediaSignalingPackage_HealthCheckRequest,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<_mediaSignalingPackage_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  healthCheck(
    argument: _mediaSignalingPackage_HealthCheckRequest,
    metadata: grpc.Metadata,
    callback: grpc.requestCallback<_mediaSignalingPackage_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  healthCheck(
    argument: _mediaSignalingPackage_HealthCheckRequest,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<_mediaSignalingPackage_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  healthCheck(
    argument: _mediaSignalingPackage_HealthCheckRequest,
    callback: grpc.requestCallback<_mediaSignalingPackage_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
}

export interface MediaSignalingServiceHandlers
  extends grpc.UntypedServiceImplementation {
  HealthCheck: grpc.handleUnaryCall<
    _mediaSignalingPackage_HealthCheckRequest__Output,
    _mediaSignalingPackage_HealthCheckResponse
  >;
}

export interface MediaSignalingServiceDefinition
  extends grpc.ServiceDefinition {
  HealthCheck: MethodDefinition<
    _mediaSignalingPackage_HealthCheckRequest,
    _mediaSignalingPackage_HealthCheckResponse,
    _mediaSignalingPackage_HealthCheckRequest__Output,
    _mediaSignalingPackage_HealthCheckResponse__Output
  >;
}
