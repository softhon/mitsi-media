export enum SignalingClientActions {
  Message = 'message',
  Heartbeat = 'heartbeat',
  Connected = 'connected',
  JoinRoom = 'join-room',
  JoinVisitors = 'join-visitors',
  JoinWaiters = 'join-waiters',
  GetRoomData = 'get-room-data',
  GetRtpCapabilities = 'get-rtp-capabilities',
}
export enum PubSubActions {
  Message = 'message',
  EndMeeting = 'end-meeting',
}

export enum ServiceActions {
  Close = 'close',
}

export enum MediaSignalingActions {
  Connected = 'connected',
  Heartbeat = 'heartbeat',
  ServerShutdown = 'server-shutdown',
}
