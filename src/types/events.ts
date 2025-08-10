export enum SignallingEvents {
  Message = 'message',
  Connected = 'connected',
  JoinRoom = 'join-room',
  JoinVisitors = 'join-visitors',
  JoinWaiters = 'join-waiters',
  GetRoomData = 'get-room-data',
  GetRtpCapabilities = 'get-rtp-capabilities',
}
export enum PubSubEvents {
  Message = 'message',
  EndMeeting = 'end-meeting',
}

export enum ServiceEvents {
  Close = 'close',
}
