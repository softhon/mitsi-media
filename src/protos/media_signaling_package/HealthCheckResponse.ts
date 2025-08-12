// Original file: src/protos/media-signaling.proto


// Original file: src/protos/media-signaling.proto

export const _media_signaling_package_HealthCheckResponse_ServingStatus = {
  UNKNOWN: 0,
  SERVING: 1,
  NOT_SERVING: 2,
  SERVICE_UNKNOWN: 3,
} as const;

export type _media_signaling_package_HealthCheckResponse_ServingStatus =
  | 'UNKNOWN'
  | 0
  | 'SERVING'
  | 1
  | 'NOT_SERVING'
  | 2
  | 'SERVICE_UNKNOWN'
  | 3

export type _media_signaling_package_HealthCheckResponse_ServingStatus__Output = typeof _media_signaling_package_HealthCheckResponse_ServingStatus[keyof typeof _media_signaling_package_HealthCheckResponse_ServingStatus]

export interface HealthCheckResponse {
  'status'?: (_media_signaling_package_HealthCheckResponse_ServingStatus);
}

export interface HealthCheckResponse__Output {
  'status'?: (_media_signaling_package_HealthCheckResponse_ServingStatus__Output);
}
