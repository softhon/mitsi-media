// Original file: src/protos/media-signaling.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { SendMessageRequest as _media_signaling_package_SendMessageRequest, SendMessageRequest__Output as _media_signaling_package_SendMessageRequest__Output } from '../media_signaling_package/SendMessageRequest';
import type { SendMessageResponse as _media_signaling_package_SendMessageResponse, SendMessageResponse__Output as _media_signaling_package_SendMessageResponse__Output } from '../media_signaling_package/SendMessageResponse';

export interface MediaSignalingClient extends grpc.Client {
  SendMessage(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_media_signaling_package_SendMessageRequest, _media_signaling_package_SendMessageResponse__Output>;
  SendMessage(options?: grpc.CallOptions): grpc.ClientDuplexStream<_media_signaling_package_SendMessageRequest, _media_signaling_package_SendMessageResponse__Output>;
  sendMessage(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_media_signaling_package_SendMessageRequest, _media_signaling_package_SendMessageResponse__Output>;
  sendMessage(options?: grpc.CallOptions): grpc.ClientDuplexStream<_media_signaling_package_SendMessageRequest, _media_signaling_package_SendMessageResponse__Output>;
  
}

export interface MediaSignalingHandlers extends grpc.UntypedServiceImplementation {
  SendMessage: grpc.handleBidiStreamingCall<_media_signaling_package_SendMessageRequest__Output, _media_signaling_package_SendMessageResponse>;
  
}

export interface MediaSignalingDefinition extends grpc.ServiceDefinition {
  SendMessage: MethodDefinition<_media_signaling_package_SendMessageRequest, _media_signaling_package_SendMessageResponse, _media_signaling_package_SendMessageRequest__Output, _media_signaling_package_SendMessageResponse__Output>
}
