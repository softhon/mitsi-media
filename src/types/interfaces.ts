export type ProducerSource = 'mic' | 'camera' | 'screen' | 'screenAudio';

export type TransportKind = 'producer' | 'consumer';
export type AckCallback<T = { [key: string]: unknown }> = (res: {
  status: 'success' | 'error';
  error?: Error | unknown | null;
  response?: T;
}) => void;
export type PeerType = 'Recorder' | 'Attendee';

export enum Role {
  Moderator = 'Moderator',
  Speaker = 'Speaker',
  Participant = 'Participant',
}

export enum Tag {
  Host = 'Host',
  Cohost = 'Co-host',
  Moderator = 'Moderator',
  Speaker = 'Speaker',
  Pinned = 'Pinned',
  Participant = 'Participant',
}

export enum HTTPSTATUS {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORISED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
}

export interface HandState {
  raised: boolean;
  timestamp?: number;
}

export interface MessageData {
  event: string;
  args: { [key: string]: unknown };
}

export interface RoomData {
  id: string;
  title: string;
  roomId: string;
  description?: string;
  host: {
    id: string;
    name: string;
  };
  coHostEmails: string[];
  guestEmails: string[];
  allowWaiting?: boolean;
}

export interface RoomInstanceData {
  roomId: string;
  hostId: string;
  coHostEmails: string[];
  started: number;
  maxDuration: number;
  maxPeers: number;
  allowRecording: boolean;
  allowWaiting: boolean;
  activeSpeakerPeerId?: string | null;
  recording: boolean;
  timeLeft?: number;
  isFull?: boolean;
}

export interface PeerData {
  id: string;
  userId?: string;
  name: string;
  email?: string;
  photo?: string;
  color?: string;
  isMobileDevice?: boolean;
  jobTitle?: string;
  isRejoining?: boolean;
  isRecorder?: boolean;
  hand?: HandState;
  roles?: Role[];
  tag?: Tag;
  pinned?: boolean;
  online?: boolean;
  joined?: number;
  reconnecting?: boolean;
}

export interface AttendeeData {
  id: string;
  name: string;
  userId?: string;
  photo?: string;
  color?: string;
  email?: string;
  info?: string;
  joined: number;
}

export interface ChatData {
  id: string;
  text: string;
  sender: PeerData;
  receiver: PeerData;
  isFile?: boolean;
  isPinned?: boolean;
  createdAt: number;
}

export interface MediaNodeData {
  id: string;
  ip: string;
  host: string;
}

export interface Reaction {
  id: string;
  name: string;
  peerId: string;
  peerName: string;
  position: `${number}%`;
  timestamp: number;
}
