import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LogsService } from './logs.service';
import { LogEntry, LogsResponse, LlmProvider } from './logs.types';

interface LogsViewModel {
  data: LogsResponse | null;
  loading: boolean;
  error?: string;
}

@Component({
  selector: 'app-logs-page',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './logs-page.component.html',
  styleUrl: './logs-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogsPageComponent {
  private readonly logsService = inject(LogsService);

  protected readonly providers: LlmProvider[] = ['stackspot', 'openai'];
  protected readonly selectedProvider = signal<LlmProvider>('stackspot');
  protected readonly state = signal<LogsViewModel>({ data: null, loading: true });

  protected readonly entries = computed<LogEntry[]>(() => this.state().data?.entries ?? []);
  protected readonly statistics = computed(() => this.state().data?.statistics);
  protected readonly lastUpdated = computed(() => this.state().data?.lastUpdated ?? null);

  constructor() {
    this.load();
  }

  protected async load(provider: LlmProvider = this.selectedProvider()): Promise<void> {
    this.state.update((state) => ({ ...state, loading: true, error: undefined }));
    try {
      const data = await firstValueFrom(this.logsService.loadLogs(provider));
      this.state.set({ data, loading: false });
    } catch (error: any) {
      this.state.set({
        data: null,
        loading: false,
        error: error?.error?.error ?? error?.message ?? 'Falha ao carregar logs.',
      });
    }
  }

  protected async changeProvider(provider: LlmProvider): Promise<void> {
    if (this.selectedProvider() === provider) {
      return;
    }
    this.selectedProvider.set(provider);
    await this.load(provider);
  }

  protected formatTokens(value?: number | null): string {
    if (!value) {
      return '0';
    }
    return value.toLocaleString('pt-BR');
  }

  protected formatCost(value?: number | null): string {
    if (value === null || value === undefined) {
      return '—';
    }
    return `$${value.toFixed(4)}`;
  }

  protected formatType(type: string): string {
    switch (type) {
      case 'connection':
        return 'Conexão';
      case 'disconnection':
        return 'Desconexão';
      case 'agent_selection':
        return 'Seleção de agente';
      case 'message_sent':
        return 'Mensagem enviada';
      case 'message_received':
        return 'Mensagem recebida';
      case 'tool_execution':
        return 'Execução de tool';
      case 'tool_result':
        return 'Resultado de tool';
      case 'run_status':
        return 'Status de execução';
      case 'error':
        return 'Erro';
      case 'response':
        return 'Resposta';
      case 'token_usage':
        return 'Uso de tokens';
      case 'monitoring':
        return 'Monitoramento';
      default:
        return type;
    }
  }
}
