import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { MediaSignalingClient as _mediaSignalingPackage_MediaSignalingClient, MediaSignalingDefinition as _mediaSignalingPackage_MediaSignalingDefinition } from './mediaSignalingPackage/MediaSignaling';
import type { SendMessageRequest as _mediaSignalingPackage_SendMessageRequest, SendMessageRequest__Output as _mediaSignalingPackage_SendMessageRequest__Output } from './mediaSignalingPackage/SendMessageRequest';
import type { SendMessageResponse as _mediaSignalingPackage_SendMessageResponse, SendMessageResponse__Output as _mediaSignalingPackage_SendMessageResponse__Output } from './mediaSignalingPackage/SendMessageResponse';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  mediaSignalingPackage: {
    MediaSignaling: SubtypeConstructor<typeof grpc.Client, _mediaSignalingPackage_MediaSignalingClient> & { service: _mediaSignalingPackage_MediaSignalingDefinition }
    SendMessageRequest: MessageTypeDefinition<_mediaSignalingPackage_SendMessageRequest, _mediaSignalingPackage_SendMessageRequest__Output>
    SendMessageResponse: MessageTypeDefinition<_mediaSignalingPackage_SendMessageResponse, _mediaSignalingPackage_SendMessageResponse__Output>
  }
}

