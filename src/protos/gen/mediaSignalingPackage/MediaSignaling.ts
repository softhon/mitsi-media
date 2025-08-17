// Original file: src/protos/media-signaling.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { SendMessageRequest as _mediaSignalingPackage_SendMessageRequest, SendMessageRequest__Output as _mediaSignalingPackage_SendMessageRequest__Output } from '../mediaSignalingPackage/SendMessageRequest';
import type { SendMessageResponse as _mediaSignalingPackage_SendMessageResponse, SendMessageResponse__Output as _mediaSignalingPackage_SendMessageResponse__Output } from '../mediaSignalingPackage/SendMessageResponse';

export interface MediaSignalingClient extends grpc.Client {
  SendMessage(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_mediaSignalingPackage_SendMessageRequest, _mediaSignalingPackage_SendMessageResponse__Output>;
  SendMessage(options?: grpc.CallOptions): grpc.ClientDuplexStream<_mediaSignalingPackage_SendMessageRequest, _mediaSignalingPackage_SendMessageResponse__Output>;
  sendMessage(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_mediaSignalingPackage_SendMessageRequest, _mediaSignalingPackage_SendMessageResponse__Output>;
  sendMessage(options?: grpc.CallOptions): grpc.ClientDuplexStream<_mediaSignalingPackage_SendMessageRequest, _mediaSignalingPackage_SendMessageResponse__Output>;
  
}

export interface MediaSignalingHandlers extends grpc.UntypedServiceImplementation {
  SendMessage: grpc.handleBidiStreamingCall<_mediaSignalingPackage_SendMessageRequest__Output, _mediaSignalingPackage_SendMessageResponse>;
  
}

export interface MediaSignalingDefinition extends grpc.ServiceDefinition {
  SendMessage: MethodDefinition<_mediaSignalingPackage_SendMessageRequest, _mediaSignalingPackage_SendMessageResponse, _mediaSignalingPackage_SendMessageRequest__Output, _mediaSignalingPackage_SendMessageResponse__Output>
}
