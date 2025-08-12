// Original file: src/protos/media-signaling.proto


// Original file: src/protos/media-signaling.proto

export const _mediaSignalingPackage_HealthCheckResponse_ServingStatus = {
  UNKNOWN: 0,
  SERVING: 1,
  NOT_SERVING: 2,
  SERVICE_UNKNOWN: 3,
} as const;

export type _mediaSignalingPackage_HealthCheckResponse_ServingStatus =
  | 'UNKNOWN'
  | 0
  | 'SERVING'
  | 1
  | 'NOT_SERVING'
  | 2
  | 'SERVICE_UNKNOWN'
  | 3

export type _mediaSignalingPackage_HealthCheckResponse_ServingStatus__Output = typeof _mediaSignalingPackage_HealthCheckResponse_ServingStatus[keyof typeof _mediaSignalingPackage_HealthCheckResponse_ServingStatus]

export interface HealthCheckResponse {
  'status'?: (_mediaSignalingPackage_HealthCheckResponse_ServingStatus);
}

export interface HealthCheckResponse__Output {
  'status'?: (_mediaSignalingPackage_HealthCheckResponse_ServingStatus__Output);
}
