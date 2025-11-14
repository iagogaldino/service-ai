import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TokensService } from './tokens.service';
import { LlmProvider, TokenHistoryEntry, TokensResponse } from './tokens.types';

interface TokensViewModel {
  data: TokensResponse | null;
  loading: boolean;
  error?: string;
}

@Component({
  selector: 'app-tokens-page',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './tokens-page.component.html',
  styleUrl: './tokens-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TokensPageComponent {
  private readonly tokensService = inject(TokensService);

  protected readonly providers: LlmProvider[] = ['stackspot', 'openai'];
  protected readonly state = signal<TokensViewModel>({ data: null, loading: true });
  protected readonly selectedProvider = signal<LlmProvider>('stackspot');

  protected readonly entries = computed<TokenHistoryEntry[]>(
    () => this.state().data?.entries ?? [],
  );

  protected readonly totals = computed(() => ({
    tokens: this.state().data?.totalTokens ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    cost: this.state().data?.totalCost ?? { promptCost: 0, completionCost: 0, totalCost: 0 },
  }));

  protected readonly lastUpdated = computed(() => this.state().data?.lastUpdated ?? null);

  constructor() {
    this.load();
  }

  protected async load(provider: LlmProvider = this.selectedProvider()): Promise<void> {
    this.state.update((state) => ({ ...state, loading: true, error: undefined }));
    try {
      const data = await firstValueFrom(this.tokensService.loadTokens(provider));
      this.state.set({ data, loading: false });
    } catch (error: any) {
      this.state.set({
        data: null,
        loading: false,
        error: error?.error?.error ?? error?.message ?? 'Falha ao carregar histórico de tokens.',
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

  protected formatCost(value?: number | null): string {
    if (value === null || value === undefined) {
      return '—';
    }
    return `$${value.toFixed(4)}`;
  }

  protected formatTokens(value?: number | null): string {
    if (value === null || value === undefined) {
      return '0';
    }
    return value.toLocaleString('pt-BR');
  }
}
