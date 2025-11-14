import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ChatService } from '../chat/chat.service';
import { MonitorConnectionsResponse, MonitorEvent } from './monitor.types';

@Injectable({ providedIn: 'root' })
export class MonitorService {
  private readonly http = inject(HttpClient);
  private readonly chat = inject(ChatService);

  loadConnections(): Observable<MonitorConnectionsResponse> {
    return this.http.get<MonitorConnectionsResponse>('/api/connections');
  }

  startMonitoring(socketId: string): void {
    this.chat.emit('start_monitoring', { targetSocketId: socketId });
  }

  stopMonitoring(): void {
    this.chat.emit('stop_monitoring');
  }

  onMonitoringStarted(handler: (payload: any) => void): () => void {
    return this.chat.registerEvent('monitoring_started', handler);
  }

  onMonitoringEvent(handler: (payload: MonitorEvent) => void): () => void {
    return this.chat.registerEvent('monitored_event', handler);
  }

  onMonitoringError(handler: (payload: { message: string }) => void): () => void {
    return this.chat.registerEvent('monitoring_error', handler);
  }

  get socketId(): string | undefined {
    return this.chat.socketId;
  }
}

