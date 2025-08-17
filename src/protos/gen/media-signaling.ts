import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { MediaSignalingClient as _mediaSignalingPackage_MediaSignalingClient, MediaSignalingDefinition as _mediaSignalingPackage_MediaSignalingDefinition } from './mediaSignalingPackage/MediaSignaling';
import type { MessageRequest as _mediaSignalingPackage_MessageRequest, MessageRequest__Output as _mediaSignalingPackage_MessageRequest__Output } from './mediaSignalingPackage/MessageRequest';
import type { MessageResponse as _mediaSignalingPackage_MessageResponse, MessageResponse__Output as _mediaSignalingPackage_MessageResponse__Output } from './mediaSignalingPackage/MessageResponse';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  mediaSignalingPackage: {
    MediaSignaling: SubtypeConstructor<typeof grpc.Client, _mediaSignalingPackage_MediaSignalingClient> & { service: _mediaSignalingPackage_MediaSignalingDefinition }
    MessageRequest: MessageTypeDefinition<_mediaSignalingPackage_MessageRequest, _mediaSignalingPackage_MessageRequest__Output>
    MessageResponse: MessageTypeDefinition<_mediaSignalingPackage_MessageResponse, _mediaSignalingPackage_MessageResponse__Output>
  }
}

