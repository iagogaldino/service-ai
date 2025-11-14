import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MonitorService } from './monitor.service';
import { MonitorConnection, MonitorEvent } from './monitor.types';

interface MonitorState {
  connections: MonitorConnection[];
  loading: boolean;
  error?: string;
}

@Component({
  selector: 'app-monitor-page',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './monitor-page.component.html',
  styleUrl: './monitor-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonitorPageComponent {
  private readonly monitorService = inject(MonitorService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<MonitorState>({ connections: [], loading: true });
  protected readonly selectedConnection = signal<MonitorConnection | null>(null);
  protected readonly monitoringTarget = signal<string | null>(null);
  protected readonly monitoringActive = signal<boolean>(false);
  protected readonly events = signal<MonitorEvent[]>([]);
  protected readonly monitorError = signal<string | null>(null);

  private readonly unregisterCallbacks: Array<() => void> = [];
  private refreshTimerId: any;

  protected readonly connections = computed(() => this.state().connections);
  protected readonly loadingConnections = computed(() => this.state().loading);
  protected readonly connectionError = computed(() => this.state().error);
  protected readonly socketId: Signal<string | undefined> = computed(() =>
    this.monitorService.socketId,
  );

  constructor() {
    this.registerSocketListeners();
    this.loadConnections();
    this.refreshTimerId = setInterval(() => this.loadConnections(false), 5000);
    this.destroyRef.onDestroy(() => {
      this.unregisterCallbacks.forEach((dispose) => dispose());
      clearInterval(this.refreshTimerId);
      this.monitorService.stopMonitoring();
    });
  }

  protected async loadConnections(showLoading = true): Promise<void> {
    if (showLoading) {
      this.state.update((state) => ({ ...state, loading: true, error: undefined }));
    }
    try {
      const response = await firstValueFrom(this.monitorService.loadConnections());
      this.state.set({ connections: response.connections ?? [], loading: false });
      if (this.selectedConnection()) {
        const updated = response.connections.find(
          (conn) => conn.socketId === this.selectedConnection()!.socketId,
        );
        if (!updated) {
          this.clearMonitoringState();
        } else {
          this.selectedConnection.set(updated);
        }
      }
    } catch (error: any) {
      this.state.set({
        connections: [],
        loading: false,
        error: error?.error?.error ?? error?.message ?? 'Falha ao carregar conexões.',
      });
    }
  }

  protected selectConnection(connection: MonitorConnection): void {
    this.selectedConnection.set(connection);
    this.events.set([]);
    this.monitorError.set(null);
    this.monitoringTarget.set(connection.socketId);
    this.monitoringActive.set(false);
    this.monitorService.startMonitoring(connection.socketId);
  }

  protected stopMonitoring(): void {
    this.monitorService.stopMonitoring();
    this.monitoringActive.set(false);
    this.monitoringTarget.set(null);
  }

  protected formatConnectionInfo(connection: MonitorConnection): string {
    return `${connection.messageCount} mensagem(ns)`;
  }

  protected resolveEventIcon(eventType: string): string {
    if (eventType.includes('message')) return '💬';
    if (eventType.includes('action')) return '⚙️';
    if (eventType.includes('response')) return '✅';
    if (eventType.includes('error')) return '❌';
    if (eventType.includes('monitor')) return '📡';
    return '📋';
  }

  protected resolveEventLabel(eventType: string): string {
    return eventType.replace(/_/g, ' ');
  }

  protected resolveEventClass(eventType: string): string {
    if (!eventType) return 'info';
    if (eventType.includes('error')) return 'error';
    if (eventType.includes('response') || eventType.includes('assistant')) return 'assistant';
    if (eventType.includes('message') || eventType.includes('user')) return 'user';
    if (eventType.includes('action')) return 'action';
    return 'info';
  }

  protected trackEvent(index: number, event: MonitorEvent): string {
    return `${event.timestamp}-${event.event}-${index}`;
  }

  private registerSocketListeners(): void {
    this.unregisterCallbacks.push(
      this.monitorService.onMonitoringStarted((payload: { targetSocketId?: string }) => {
        if (!payload?.targetSocketId) {
          return;
        }
        if (
          this.selectedConnection()?.socketId &&
          payload.targetSocketId === this.selectedConnection()?.socketId
        ) {
          this.monitoringActive.set(true);
          this.events.set([]);
          this.monitorError.set(null);
        }
      }),
    );

    this.unregisterCallbacks.push(
      this.monitorService.onMonitoringEvent((payload: MonitorEvent) => {
        const currentTarget = this.selectedConnection()?.socketId;
        if (!currentTarget || payload.targetSocketId !== currentTarget) {
          return;
        }

        this.events.update((existing) => {
          const updated = [...existing, payload];
          if (updated.length > 500) {
            updated.shift();
          }
          return updated;
        });
      }),
    );

    this.unregisterCallbacks.push(
      this.monitorService.onMonitoringError((payload: { message: string }) => {
        this.monitorError.set(payload?.message ?? 'Erro no monitoramento.');
        this.monitoringActive.set(false);
      }),
    );
  }

  private clearMonitoringState(): void {
    this.selectedConnection.set(null);
    this.monitoringTarget.set(null);
    this.monitoringActive.set(false);
    this.events.set([]);
  }
}
