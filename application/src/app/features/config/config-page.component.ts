import { CommonModule, DatePipe, NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, startWith } from 'rxjs';
import { ConfigService } from './config.service';
import {
  ConfigRequest,
  ConfigResponse,
  LlmProvider,
  StackspotProxyPayload,
} from './config.types';

type StackspotControls = {
  clientId: FormControl<string>;
  clientSecret: FormControl<string>;
  realm: FormControl<string>;
  proxyEnabled: FormControl<boolean>;
  proxyHttpsHost: FormControl<string>;
  proxyHttpsPort: FormControl<string>;
  proxyHttpsUsername: FormControl<string>;
  proxyHttpsPassword: FormControl<string>;
  proxyHttpsClearPassword: FormControl<boolean>;
  proxyHttpsTunnel: FormControl<boolean>;
  proxyNoProxy: FormControl<string>;
  proxyStrategy: FormControl<string>;
};

type ConfigFormControls = {
  llmProvider: FormControl<LlmProvider>;
  port: FormControl<number | null>;
  openaiApiKey: FormControl<string>;
  stackspot: FormGroup<StackspotControls>;
};

interface UiMessage {
  type: 'info' | 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-config-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgClass, DatePipe],
  templateUrl: './config-page.component.html',
  styleUrl: './config-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ConfigService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = this.fb.group<ConfigFormControls>({
    llmProvider: this.fb.nonNullable.control<LlmProvider>('stackspot'),
    port: this.fb.control<number | null>(3000),
    openaiApiKey: this.fb.nonNullable.control(''),
    stackspot: this.fb.group<StackspotControls>({
      clientId: this.fb.nonNullable.control(''),
      clientSecret: this.fb.nonNullable.control(''),
      realm: this.fb.nonNullable.control('stackspot-freemium'),
      proxyEnabled: this.fb.nonNullable.control(false),
      proxyHttpsHost: this.fb.nonNullable.control(''),
      proxyHttpsPort: this.fb.nonNullable.control(''),
      proxyHttpsUsername: this.fb.nonNullable.control(''),
      proxyHttpsPassword: this.fb.nonNullable.control(''),
      proxyHttpsClearPassword: this.fb.nonNullable.control(false),
      proxyHttpsTunnel: this.fb.nonNullable.control(false),
      proxyNoProxy: this.fb.nonNullable.control(''),
      proxyStrategy: this.fb.nonNullable.control(''),
    }),
  });

  private readonly stackspotGroup = this.form.controls.stackspot;

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly message = signal<UiMessage | null>(null);

  protected readonly openaiConfigured = signal(false);
  protected readonly openaiPreview = signal<string | null>(null);
  protected readonly stackspotConfigured = signal(false);
  protected readonly stackspotPreview = signal<string | null>(null);
  protected readonly stackspotProxyEnabledPreviously = signal(false);
  protected readonly stackspotProxyHasPassword = signal(false);
  protected readonly lastUpdated = signal<string | null>(null);

  protected readonly provider = toSignal(
    this.form.controls.llmProvider.valueChanges.pipe(
      startWith(this.form.controls.llmProvider.value),
    ),
    { initialValue: this.form.controls.llmProvider.value },
  );

  protected readonly proxyEnabled = toSignal(
    this.stackspotGroup.controls.proxyEnabled.valueChanges.pipe(
      startWith(this.stackspotGroup.controls.proxyEnabled.value),
    ),
    { initialValue: this.stackspotGroup.controls.proxyEnabled.value },
  );

  constructor() {
    this.stackspotGroup.controls.proxyHttpsPassword.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value: string) => {
        if (value && value.trim().length > 0) {
          this.stackspotGroup.controls.proxyHttpsClearPassword.setValue(false, {
            emitEvent: false,
          });
        }
      });
  }

  async ngOnInit(): Promise<void> {
    await this.loadConfig();
  }

  protected get proxyPasswordInfo(): string {
    const password = this.stackspotGroup.controls.proxyHttpsPassword.value.trim();
    if (password) {
      return 'Uma nova senha será aplicada após salvar.';
    }
    if (this.stackspotGroup.controls.proxyHttpsClearPassword.value) {
      return 'Senha atual será removida após salvar.';
    }
    if (this.stackspotProxyHasPassword()) {
      return 'Senha configurada (não exibida). Informe uma nova senha para atualizar.';
    }
    return '';
  }

  protected async reload(): Promise<void> {
    await this.loadConfig();
    this.message.set({
      type: 'info',
      text: 'Configuração recarregada.',
    });
  }

  protected async onSubmit(): Promise<void> {
    if (this.saving()) {
      return;
    }

    const raw = this.form.getRawValue();
    const trimmedOpenaiKey = raw.openaiApiKey.trim();
    const trimmedClientId = raw.stackspot.clientId.trim();
    const trimmedClientSecret = raw.stackspot.clientSecret.trim();
    const trimmedRealm = raw.stackspot.realm.trim() || 'stackspot-freemium';
    const trimmedHost = raw.stackspot.proxyHttpsHost.trim();
    const trimmedPort = raw.stackspot.proxyHttpsPort.trim();
    const trimmedUsername = raw.stackspot.proxyHttpsUsername.trim();
    const trimmedPassword = raw.stackspot.proxyHttpsPassword;
    const trimmedStrategy = raw.stackspot.proxyStrategy.trim();
    const trimmedNoProxy = raw.stackspot.proxyNoProxy.trim();
    const portValue = raw.port;

    if (portValue !== null && portValue !== undefined) {
      if (!Number.isInteger(portValue) || portValue <= 0) {
        this.setError('Porta inválida. Informe um número inteiro positivo.');
        return;
      }
    }

    if (raw.llmProvider === 'openai') {
      if (!trimmedOpenaiKey && !this.openaiConfigured()) {
        this.setError('OpenAI API Key é obrigatória para configurar o OpenAI.');
        return;
      }
      if (trimmedOpenaiKey && !trimmedOpenaiKey.startsWith('sk-')) {
        this.setError('OpenAI API Key inválida. Ela deve começar com "sk-".');
        return;
      }
    } else if (raw.llmProvider === 'stackspot') {
      const hasId = trimmedClientId.length > 0;
      const hasSecret = trimmedClientSecret.length > 0;
      if (hasId !== hasSecret) {
        this.setError('Informe Client ID e Client Secret do StackSpot para atualizar as credenciais.');
        return;
      }
      if (!hasId && !this.stackspotConfigured()) {
        this.setError('StackSpot Client ID e Client Secret são obrigatórios para usar o StackSpot.');
        return;
      }
      if (raw.stackspot.proxyEnabled && !trimmedHost) {
        this.setError('Informe o host do proxy StackSpot.');
        return;
      }
      if (trimmedPort) {
        const numericPort = Number(trimmedPort);
        if (!Number.isInteger(numericPort) || numericPort <= 0 || numericPort > 65535) {
          this.setError('Porta do proxy inválida. Utilize um número entre 1 e 65535.');
          return;
        }
      }
    }

    const payload: ConfigRequest = {
      llmProvider: raw.llmProvider,
      port: portValue ?? undefined,
    };

    if (trimmedOpenaiKey) {
      payload.openaiApiKey = trimmedOpenaiKey;
    }

    if (trimmedClientId && trimmedClientSecret) {
      payload.stackspotClientId = trimmedClientId;
      payload.stackspotClientSecret = trimmedClientSecret;
      payload.stackspotRealm = trimmedRealm;
    } else if (raw.llmProvider === 'stackspot' && trimmedRealm) {
      payload.stackspotRealm = trimmedRealm;
    }

    if (raw.stackspot.proxyEnabled) {
      const proxyPayload: StackspotProxyPayload = {
        enabled: true,
        https: {
          host: trimmedHost,
          port: trimmedPort ? Number(trimmedPort) : undefined,
          username: trimmedUsername || undefined,
          tunnel: raw.stackspot.proxyHttpsTunnel,
        },
        noProxy: trimmedNoProxy
          ? trimmedNoProxy.split(',').map((entry) => entry.trim()).filter(Boolean)
          : undefined,
        strategy: trimmedStrategy || undefined,
      };

      if (trimmedPassword) {
        proxyPayload.https!.password = trimmedPassword;
      } else if (raw.stackspot.proxyHttpsClearPassword) {
        proxyPayload.https!.clearPassword = true;
      }

      payload.stackspotProxy = proxyPayload;
    } else if (this.stackspotProxyEnabledPreviously()) {
      payload.stackspotProxy = { enabled: false };
    }

    this.saving.set(true);
    this.message.set({
      type: 'info',
      text: 'Salvando configuração...',
    });

    try {
      const response = await firstValueFrom(this.service.saveConfig(payload));
      if (response.success) {
        this.message.set({
          type: 'success',
          text: response.message,
        });
        await this.loadConfig();
      } else {
        this.setError(response.error || 'Erro ao salvar configuração.');
      }
    } catch (error: any) {
      const serverMessage =
        error?.error?.error || error?.message || 'Erro ao salvar configuração.';
      this.setError(serverMessage);
    } finally {
      this.saving.set(false);
      this.form.markAsPristine();
    }
  }

  private async loadConfig(): Promise<void> {
    this.loading.set(true);
    this.message.set(null);
    try {
      const config = await firstValueFrom(this.service.loadConfig());
      this.applyConfig(config);
      this.form.markAsPristine();
    } catch (error: any) {
      console.error('Erro ao carregar configuração', error);
      this.setError(error?.error?.error || 'Erro ao carregar configuração.');
    } finally {
      this.loading.set(false);
    }
  }

  private applyConfig(config: ConfigResponse): void {
    this.openaiConfigured.set(Boolean(config.openai?.configured));
    this.openaiPreview.set(config.openai?.apiKeyPreview ?? null);
    this.stackspotConfigured.set(Boolean(config.stackspot?.configured));
    this.stackspotPreview.set(config.stackspot?.clientIdPreview ?? null);
    this.lastUpdated.set(config.lastUpdated ?? null);

    const proxy = config.stackspot?.proxy;
    this.stackspotProxyEnabledPreviously.set(Boolean(proxy?.enabled));
    this.stackspotProxyHasPassword.set(Boolean(proxy?.https?.hasPassword));

    const https = proxy?.https ?? {};

    this.form.reset({
      llmProvider: config.llmProvider ?? 'stackspot',
      port: config.port ?? 3000,
      openaiApiKey: '',
      stackspot: {
        clientId: '',
        clientSecret: '',
        realm: config.stackspot?.realm ?? 'stackspot-freemium',
        proxyEnabled: Boolean(proxy?.enabled),
        proxyHttpsHost: https.host ?? '',
        proxyHttpsPort:
          typeof https.port === 'number' && !Number.isNaN(https.port)
            ? String(https.port)
            : '',
        proxyHttpsUsername: https.username ?? '',
        proxyHttpsPassword: '',
        proxyHttpsClearPassword: false,
        proxyHttpsTunnel: Boolean(https.tunnel),
        proxyNoProxy: proxy?.noProxy?.length ? proxy.noProxy.join(', ') : '',
        proxyStrategy: proxy?.strategy ?? '',
      },
    });
  }

  private setError(message: string): void {
    this.message.set({ type: 'error', text: message });
    this.saving.set(false);
  }
}
