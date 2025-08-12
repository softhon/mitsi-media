// Original file: src/protos/media-signaling.proto

import type * as grpc from '@grpc/grpc-js';
import type { MethodDefinition } from '@grpc/proto-loader';
import type {
  HealthCheckRequest as _media_signaling_package_HealthCheckRequest,
  HealthCheckRequest__Output as _media_signaling_package_HealthCheckRequest__Output,
} from './HealthCheckRequest';
import type {
  HealthCheckResponse as _media_signaling_package_HealthCheckResponse,
  HealthCheckResponse__Output as _media_signaling_package_HealthCheckResponse__Output,
} from './HealthCheckResponse';

export interface MediaSignalingClient extends grpc.Client {
  HealthCheck(
    argument: _media_signaling_package_HealthCheckRequest,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<_media_signaling_package_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  HealthCheck(
    argument: _media_signaling_package_HealthCheckRequest,
    metadata: grpc.Metadata,
    callback: grpc.requestCallback<_media_signaling_package_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  HealthCheck(
    argument: _media_signaling_package_HealthCheckRequest,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<_media_signaling_package_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  HealthCheck(
    argument: _media_signaling_package_HealthCheckRequest,
    callback: grpc.requestCallback<_media_signaling_package_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  healthCheck(
    argument: _media_signaling_package_HealthCheckRequest,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<_media_signaling_package_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  healthCheck(
    argument: _media_signaling_package_HealthCheckRequest,
    metadata: grpc.Metadata,
    callback: grpc.requestCallback<_media_signaling_package_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  healthCheck(
    argument: _media_signaling_package_HealthCheckRequest,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<_media_signaling_package_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
  healthCheck(
    argument: _media_signaling_package_HealthCheckRequest,
    callback: grpc.requestCallback<_media_signaling_package_HealthCheckResponse__Output>
  ): grpc.ClientUnaryCall;
}

export interface MediaSignalingHandlers
  extends grpc.UntypedServiceImplementation {
  HealthCheck: grpc.handleUnaryCall<
    _media_signaling_package_HealthCheckRequest__Output,
    _media_signaling_package_HealthCheckResponse
  >;
}

export interface MediaSignalingDefinition extends grpc.ServiceDefinition {
  HealthCheck: MethodDefinition<
    _media_signaling_package_HealthCheckRequest,
    _media_signaling_package_HealthCheckResponse,
    _media_signaling_package_HealthCheckRequest__Output,
    _media_signaling_package_HealthCheckResponse__Output
  >;
}
