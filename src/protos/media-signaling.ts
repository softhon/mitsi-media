import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { MediaSignalingClient as _media_signaling_package_MediaSignalingClient, MediaSignalingDefinition as _media_signaling_package_MediaSignalingDefinition } from './media_signaling_package/MediaSignaling';
import type { SendMessageRequest as _media_signaling_package_SendMessageRequest, SendMessageRequest__Output as _media_signaling_package_SendMessageRequest__Output } from './media_signaling_package/SendMessageRequest';
import type { SendMessageResponse as _media_signaling_package_SendMessageResponse, SendMessageResponse__Output as _media_signaling_package_SendMessageResponse__Output } from './media_signaling_package/SendMessageResponse';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  media_signaling_package: {
    MediaSignaling: SubtypeConstructor<typeof grpc.Client, _media_signaling_package_MediaSignalingClient> & { service: _media_signaling_package_MediaSignalingDefinition }
    SendMessageRequest: MessageTypeDefinition<_media_signaling_package_SendMessageRequest, _media_signaling_package_SendMessageRequest__Output>
    SendMessageResponse: MessageTypeDefinition<_media_signaling_package_SendMessageResponse, _media_signaling_package_SendMessageResponse__Output>
  }
}

