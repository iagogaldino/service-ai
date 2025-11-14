export interface MonitorConnection {
  socketId: string;
  threadId: string;
  connectedAt: string;
  lastActivity: string;
  messageCount: number;
  userAgent?: string;
  ipAddress?: string;
}

export interface MonitorConnectionsResponse {
  connections: MonitorConnection[];
}

export interface MonitorEvent {
  event: string;
  data: any;
  timestamp: string;
  targetSocketId?: string;
}

