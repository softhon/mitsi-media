import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type {
  HealthCheckRequest as _media_signaling_package_HealthCheckRequest,
  HealthCheckRequest__Output as _media_signaling_package_HealthCheckRequest__Output,
} from './media_signaling_package/HealthCheckRequest';
import type {
  HealthCheckResponse as _media_signaling_package_HealthCheckResponse,
  HealthCheckResponse__Output as _media_signaling_package_HealthCheckResponse__Output,
} from './media_signaling_package/HealthCheckResponse';
import type {
  MediaSignalingClient as _media_signaling_package_MediaSignalingClient,
  MediaSignalingDefinition as _media_signaling_package_MediaSignalingDefinition,
} from './media_signaling_package/MediaSignaling';

type SubtypeConstructor<
  Constructor extends new (...args: any) => any,
  Subtype,
> = {
  new (...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  media_signaling_package: {
    HealthCheckRequest: MessageTypeDefinition<
      _media_signaling_package_HealthCheckRequest,
      _media_signaling_package_HealthCheckRequest__Output
    >;
    HealthCheckResponse: MessageTypeDefinition<
      _media_signaling_package_HealthCheckResponse,
      _media_signaling_package_HealthCheckResponse__Output
    >;
    MediaSignaling: SubtypeConstructor<
      typeof grpc.Client,
      _media_signaling_package_MediaSignalingClient
    > & { service: _media_signaling_package_MediaSignalingDefinition };
  };
}
