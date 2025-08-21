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
  // Connection lifecycle
  Connected = 'connected',
  Disconnect = 'disconnect',
  Reconnect = 'reconnect',

  // Health monitoring
  Heartbeat = 'heartbeat',
  HeartbeatAck = 'heartbeat_ack',
  Ping = 'ping',
  Pong = 'pong',

  // Server management`
  ServerShutdown = 'server_shutdown',
  ServerRestart = 'server_restart',

  // Error handling
  Error = 'error',
  ConnectionError = 'connection_error',

  // Media specific actions (add your custom actions here)
  MediaOffer = 'media_offer',
  MediaAnswer = 'media_answer',
  IceCandidate = 'ice_candidate',
  MediaStreamStart = 'media_stream_start',
  MediaStreamStop = 'media_stream_stop',

  // Room/channel management
  JoinRoom = 'join_room',
  LeaveRoom = 'leave_room',
  RoomUpdate = 'room_update',

  // Custom actions placeholder
  Custom = 'custom',

  RtpCapabilities = 'rtp_capabilities',
}
