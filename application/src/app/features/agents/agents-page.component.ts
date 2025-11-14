import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AgentsService } from './agents.service';
import {
  AgentFormTarget,
  AgentJsonConfig,
  AgentSelection,
  AgentsHierarchy,
  AgentsSummary,
  GroupConfig,
} from './agents.types';

interface AgentsViewModel {
  summary: AgentsSummary | null;
  hierarchy: AgentsHierarchy | null;
  loading: boolean;
  error?: string;
}

@Component({
  selector: 'app-agents-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './agents-page.component.html',
  styleUrl: './agents-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentsPageComponent {
  private readonly agentsService = inject(AgentsService);
  private readonly fb = inject(FormBuilder);

  protected readonly vm: WritableSignal<AgentsViewModel> = signal({
    summary: null,
    hierarchy: null,
    loading: true,
  });

  protected readonly selection = signal<AgentSelection>({
    target: 'agent',
    mode: 'create',
  });

  protected readonly message = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly groups = computed<GroupConfig[]>(() => this.vm().hierarchy?.groups ?? []);
  protected readonly toolSets = computed<Record<string, string[]>>(
    () => this.vm().hierarchy?.toolSets ?? {},
  );

  protected readonly agentForm: FormGroup = this.fb.group({
    groupId: [''],
    name: ['', Validators.required],
    model: ['', Validators.required],
    priority: [999],
    stackspotAgentId: [''],
    description: ['', Validators.required],
    instructions: ['', Validators.required],
    toolsRaw: [''],
    shouldUseRaw: ['', Validators.required],
  });

  protected readonly fallbackInfo = computed(() => this.vm().hierarchy?.fallbackAgent ?? null);
  protected readonly mainSelector = computed(() => this.vm().hierarchy?.mainSelector ?? null);

  constructor() {
    effect(() => {
      const groups = this.groups();
      const currentSelection = this.selection();
      if (groups.length === 0 && currentSelection.target === 'agent') {
        this.agentForm.patchValue({ groupId: '' });
      }
    });
    this.loadData();
  }

  protected async loadData(): Promise<void> {
    this.vm.update((state) => ({ ...state, loading: true, error: undefined }));
    this.errorMessage.set(null);
    this.message.set(null);
    try {
      const [summary, hierarchy] = await Promise.all([
        this.agentsService.fetchSummary(),
        this.agentsService.fetchHierarchy(),
      ]);
      this.vm.set({
        summary,
        hierarchy,
        loading: false,
      });
      if (hierarchy.groups?.length) {
        const firstGroup = hierarchy.groups[0];
        if (firstGroup) {
          this.agentForm.patchValue({
            groupId: firstGroup.id,
          });
        }
      }
    } catch (error: any) {
      this.vm.update((state) => ({
        ...state,
        loading: false,
        error: error?.message ?? 'Falha ao carregar agentes',
      }));
    }
  }

  protected selectCreateAgent(groupId?: string): void {
    this.selection.set({
      target: 'agent',
      mode: 'create',
      groupId: groupId ?? this.agentForm.value.groupId ?? this.groups()[0]?.id ?? '',
    });
    this.agentForm.reset({
      groupId: groupId ?? this.groups()[0]?.id ?? '',
      name: '',
      model: '',
      priority: 999,
      stackspotAgentId: '',
      description: '',
      instructions: '',
      toolsRaw: '',
      shouldUseRaw: '',
    });
    this.message.set(null);
    this.errorMessage.set(null);
  }

  protected selectAgent(groupId: string, agent: AgentJsonConfig): void {
    this.selection.set({
      target: 'agent',
      mode: 'edit',
      groupId,
      agentName: agent.name,
    });
    this.agentForm.reset({
      groupId,
      name: agent.name,
      model: agent.model,
      priority: agent.priority ?? 999,
      stackspotAgentId: agent.stackspotAgentId ?? '',
      description: agent.description,
      instructions: agent.instructions,
      toolsRaw: agent.tools && agent.tools.length ? JSON.stringify(agent.tools, null, 2) : '',
      shouldUseRaw: JSON.stringify(agent.shouldUse ?? {}, null, 2),
    });
    this.message.set(null);
    this.errorMessage.set(null);
  }

  protected selectOrchestrator(groupId: string, orchestrator?: AgentJsonConfig | null): void {
    this.selection.set({
      target: 'orchestrator',
      mode: orchestrator ? 'edit' : 'create',
      groupId,
      agentName: orchestrator?.name,
    });
    this.agentForm.reset({
      groupId,
      name: orchestrator?.name ?? '',
      model: orchestrator?.model ?? '',
      priority: orchestrator?.priority ?? 0,
      stackspotAgentId: orchestrator?.stackspotAgentId ?? '',
      description: orchestrator?.description ?? '',
      instructions: orchestrator?.instructions ?? '',
      toolsRaw:
        orchestrator?.tools && orchestrator.tools.length
          ? JSON.stringify(orchestrator.tools, null, 2)
          : '',
      shouldUseRaw: JSON.stringify(orchestrator?.shouldUse ?? {}, null, 2),
    });
    this.message.set(null);
    this.errorMessage.set(null);
  }

  protected selectFallback(): void {
    const fallback = this.fallbackInfo();
    this.selection.set({
      target: 'fallback',
      mode: fallback ? 'edit' : 'create',
      agentName: fallback?.name,
    });
    this.agentForm.reset({
      groupId: '',
      name: fallback?.name ?? '',
      model: fallback?.model ?? '',
      priority: fallback?.priority ?? 1000,
      stackspotAgentId: fallback?.stackspotAgentId ?? '',
      description: fallback?.description ?? '',
      instructions: fallback?.instructions ?? '',
      toolsRaw: fallback?.tools && fallback.tools.length ? JSON.stringify(fallback.tools, null, 2) : '',
      shouldUseRaw: JSON.stringify(fallback?.shouldUse ?? {}, null, 2),
    });
    this.message.set(null);
    this.errorMessage.set(null);
  }

  protected isTarget(target: AgentFormTarget): boolean {
    return this.selection().target === target;
  }

  protected async submit(): Promise<void> {
    if (this.agentForm.invalid) {
      this.errorMessage.set('Preencha todos os campos obrigatórios.');
      this.agentForm.markAllAsTouched();
      return;
    }
    const selection = this.selection();
    const formValue = this.agentForm.value;
    try {
      const payload = this.buildPayload(formValue);

      if (selection.target === 'agent') {
        if (!formValue.groupId) {
          this.errorMessage.set('Selecione um grupo para o agente.');
          return;
        }
        if (selection.mode === 'edit' && selection.agentName) {
          await this.agentsService.updateAgent(formValue.groupId, selection.agentName, payload);
          this.message.set(`Agente "${selection.agentName}" atualizado com sucesso.`);
        } else {
          await this.agentsService.createAgent(formValue.groupId, payload);
          this.message.set(`Agente "${payload.name}" criado com sucesso.`);
          this.selectCreateAgent(formValue.groupId);
        }
      } else if (selection.target === 'orchestrator') {
        if (!formValue.groupId) {
          this.errorMessage.set('Selecione um grupo para configurar o orquestrador.');
          return;
        }
        await this.agentsService.upsertOrchestrator(formValue.groupId, payload);
        this.message.set('Orquestrador configurado com sucesso.');
      } else if (selection.target === 'fallback') {
        await this.agentsService.upsertFallback(payload);
        this.message.set('Agente fallback atualizado com sucesso.');
      }

      this.errorMessage.set(null);
      await this.loadData();
      if (selection.target === 'agent' && selection.mode === 'edit' && selection.agentName) {
        const groupId = formValue.groupId;
        const updatedHierarchy = this.vm().hierarchy;
        const updatedGroup = updatedHierarchy?.groups?.find((g) => g.id === groupId);
        const updatedAgent = updatedGroup?.agents.find((a) => a.name === payload.name);
        if (updatedGroup && updatedAgent) {
          this.selectAgent(updatedGroup.id, updatedAgent);
        }
      } else if (selection.target === 'orchestrator') {
        const groupId = formValue.groupId;
        const updatedHierarchy = this.vm().hierarchy;
        const updatedGroup = updatedHierarchy?.groups?.find((g) => g.id === groupId);
        this.selectOrchestrator(groupId, updatedGroup?.orchestrator ?? null);
      } else if (selection.target === 'fallback') {
        this.selectFallback();
      }
    } catch (error: any) {
      console.error(error);
      this.errorMessage.set(error?.message ?? 'Falha ao salvar agente.');
      this.message.set(null);
    }
  }

  protected async deleteSelectedAgent(): Promise<void> {
    const selection = this.selection();
    if (selection.target !== 'agent' || selection.mode !== 'edit' || !selection.agentName) {
      return;
    }
    const confirmDelete = window.confirm(
      `Tem certeza que deseja remover o agente "${selection.agentName}"?`,
    );
    if (!confirmDelete) {
      return;
    }
    const groupId = this.agentForm.value.groupId;
    if (!groupId) {
      return;
    }
    try {
      await this.agentsService.deleteAgent(groupId, selection.agentName);
      this.message.set(`Agente "${selection.agentName}" removido.`);
      this.errorMessage.set(null);
      await this.loadData();
      this.selectCreateAgent(groupId);
    } catch (error: any) {
      this.errorMessage.set(error?.message ?? 'Falha ao remover agente.');
      this.message.set(null);
    }
  }

  protected async deleteOrchestrator(groupId: string): Promise<void> {
    const confirmDelete = window.confirm(
      'Tem certeza que deseja remover o orquestrador deste grupo?',
    );
    if (!confirmDelete) {
      return;
    }
    try {
      await this.agentsService.deleteOrchestrator(groupId);
      this.message.set('Orquestrador removido com sucesso.');
      this.errorMessage.set(null);
      await this.loadData();
      const updatedGroup = this.vm().hierarchy?.groups?.find((g) => g.id === groupId);
      this.selectOrchestrator(groupId, updatedGroup?.orchestrator ?? null);
    } catch (error: any) {
      this.errorMessage.set(error?.message ?? 'Falha ao remover orquestrador.');
      this.message.set(null);
    }
  }

  protected parseToolsPreview(agent?: AgentJsonConfig | null): string {
    if (!agent?.tools || agent.tools.length === 0) {
      return 'Sem ferramentas definidas.';
    }
    return agent.tools.join(', ');
  }

  protected parseShouldUsePreview(agent?: AgentJsonConfig | null): string {
    if (!agent?.shouldUse) {
      return 'Sem regra definida.';
    }
    return JSON.stringify(agent.shouldUse, null, 2);
  }

  protected formatToolsSource(source: string): string {
    if (!source) {
      return '';
    }
    return source;
  }

  protected resetMessage(): void {
    this.message.set(null);
    this.errorMessage.set(null);
  }

  private buildPayload(formValue: any): AgentJsonConfig {
    const toolsSource = (formValue.toolsRaw ?? '').trim();
    const shouldUseSource = (formValue.shouldUseRaw ?? '').trim();

    let tools: string[] = [];
    if (toolsSource) {
      try {
        const parsed = JSON.parse(toolsSource);
        if (Array.isArray(parsed)) {
          tools = parsed.filter((item) => typeof item === 'string' && item.trim().length > 0);
        } else {
          throw new Error('Tools JSON precisa ser um array de strings.');
        }
      } catch (jsonError) {
        tools = toolsSource
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean);
      }
    }

    if (!shouldUseSource) {
      throw new Error('Regra "shouldUse" é obrigatória.');
    }

    let shouldUse: any;
    try {
      shouldUse = JSON.parse(shouldUseSource);
    } catch (error) {
      throw new Error('Regra "shouldUse" precisa ser um JSON válido.');
    }

    const payload: AgentJsonConfig = {
      name: (formValue.name ?? '').trim(),
      description: (formValue.description ?? '').trim(),
      instructions: (formValue.instructions ?? '').trim(),
      model: (formValue.model ?? '').trim(),
      priority: Number(formValue.priority ?? 999),
      tools,
      shouldUse,
    };

    if (formValue.stackspotAgentId) {
      payload.stackspotAgentId = (formValue.stackspotAgentId ?? '').trim();
    }

    return payload;
  }
}

