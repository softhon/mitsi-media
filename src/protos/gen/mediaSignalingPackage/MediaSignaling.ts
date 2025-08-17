// Original file: src/protos/media-signaling.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { MessageRequest as _mediaSignalingPackage_MessageRequest, MessageRequest__Output as _mediaSignalingPackage_MessageRequest__Output } from '../mediaSignalingPackage/MessageRequest';
import type { MessageResponse as _mediaSignalingPackage_MessageResponse, MessageResponse__Output as _mediaSignalingPackage_MessageResponse__Output } from '../mediaSignalingPackage/MessageResponse';

export interface MediaSignalingClient extends grpc.Client {
  Message(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_mediaSignalingPackage_MessageRequest, _mediaSignalingPackage_MessageResponse__Output>;
  Message(options?: grpc.CallOptions): grpc.ClientDuplexStream<_mediaSignalingPackage_MessageRequest, _mediaSignalingPackage_MessageResponse__Output>;
  message(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_mediaSignalingPackage_MessageRequest, _mediaSignalingPackage_MessageResponse__Output>;
  message(options?: grpc.CallOptions): grpc.ClientDuplexStream<_mediaSignalingPackage_MessageRequest, _mediaSignalingPackage_MessageResponse__Output>;
  
}

export interface MediaSignalingHandlers extends grpc.UntypedServiceImplementation {
  Message: grpc.handleBidiStreamingCall<_mediaSignalingPackage_MessageRequest__Output, _mediaSignalingPackage_MessageResponse>;
  
}

export interface MediaSignalingDefinition extends grpc.ServiceDefinition {
  Message: MethodDefinition<_mediaSignalingPackage_MessageRequest, _mediaSignalingPackage_MessageResponse, _mediaSignalingPackage_MessageRequest__Output, _mediaSignalingPackage_MessageResponse__Output>
}
