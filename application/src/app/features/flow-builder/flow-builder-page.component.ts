import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  Injector,
  OnDestroy,
  signal,
  ViewChild,
  inject,
} from '@angular/core';
import { ClassicPreset, GetSchemes, NodeEditor } from 'rete';
import {
  AngularPlugin,
  AngularArea2D,
  Presets as AngularPresets,
  ControlComponent,
  ConnectionComponent,
  NodeComponent,
  SocketComponent,
} from 'rete-angular-plugin/20/fesm2022/rete-angular-plugin-ng20.mjs';
import { AreaExtensions, AreaPlugin } from 'rete-area-plugin';
import {
  ConnectionPlugin,
  Presets as ConnectionPresets,
} from 'rete-connection-plugin';
import { FlowBuilderStorageService } from './flow-builder-storage.service';
import {
  FlowNodeType,
  StoredFlowConnection,
  StoredFlowGraph,
  StoredFlowNode,
} from './flow-builder.types';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

type FlowSchemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;
type FlowAreaSignals = AngularArea2D<FlowSchemes>;

@Component({
  selector: 'app-flow-builder-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './flow-builder-page.component.html',
  styleUrl: './flow-builder-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowBuilderPageComponent implements AfterViewInit, OnDestroy {
  private static readonly DRAG_MIME = 'application/x-serviceia-flow-node';

  @ViewChild('canvas', { static: true })
  private readonly canvasRef!: ElementRef<HTMLDivElement>;

  protected readonly palette: Array<{
    type: FlowNodeType;
    icon: string;
    label: string;
    description: string;
  }> = [
    { type: 'start', icon: '🟢', label: 'Start', description: 'Ponto inicial do fluxo.' },
    { type: 'agent', icon: '🤖', label: 'Agent', description: 'Executa instruções com LLM.' },
    {
      type: 'file-search',
      icon: '📂',
      label: 'File Search',
      description: 'Busca arquivos no workspace.',
    },
    { type: 'end', icon: '🏁', label: 'End', description: 'Encerramento do fluxo.' },
  ];

  private readonly baseLabels: Record<FlowNodeType, string> = {
    start: 'Start',
    agent: 'Agent',
    'file-search': 'File Search',
    end: 'End',
  };

  private readonly injector = inject(Injector);
  private readonly storage = inject(FlowBuilderStorageService);
  private readonly fb = inject(FormBuilder);

  private readonly flowSocket = new ClassicPreset.Socket('Flow');
  private readonly nodeTypeMap = new Map<string, FlowNodeType>();
  private readonly nodeCounters = new Map<FlowNodeType, number>();

  private editor?: NodeEditor<FlowSchemes>;
  private area?: AreaPlugin<FlowSchemes, FlowAreaSignals>;
  private connectionPlugin?: ConnectionPlugin<FlowSchemes, FlowAreaSignals>;
  private angularRenderer?: AngularPlugin<FlowSchemes, FlowAreaSignals>;

  protected readonly inspectorForm = this.fb.nonNullable.group({
    label: [''],
    type: ['agent' as FlowNodeType],
  });

  protected readonly nodeTypeOptions: Array<{ value: FlowNodeType; label: string }> = [
    { value: 'start', label: 'Start' },
    { value: 'agent', label: 'Agent' },
    { value: 'file-search', label: 'File Search' },
    { value: 'end', label: 'End' },
  ];

  private readonly selectedNodeSignal = signal<{ id: string; type: FlowNodeType } | null>(null);
  protected readonly selectedNode = computed(() => this.selectedNodeSignal());
  protected readonly inspectorTitle = computed(() => {
    const selection = this.selectedNodeSignal();
    if (!selection) {
      return 'Selecione um nó';
    }
    const typeLabel = this.nodeTypeOptions.find((opt) => opt.value === selection.type)?.label ?? '';
    return `${typeLabel} • ${this.editor?.getNode(selection.id)?.label ?? ''}`;
  });

  private draggedType: FlowNodeType | null = null;

  async ngAfterViewInit(): Promise<void> {
    await this.initializeEditor();
  }

  ngOnDestroy(): void {
    this.dispose();
  }

  protected handleDragStart(type: FlowNodeType, event: DragEvent): void {
    this.draggedType = type;
    event.dataTransfer?.setData(FlowBuilderPageComponent.DRAG_MIME, type);
    event.dataTransfer?.setData('text/plain', type);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  protected handleDragEnd(): void {
    this.draggedType = null;
  }

  protected allowDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected async handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const type =
      this.getDraggedType(event) ??
      (this.draggedType as FlowNodeType | null);
    this.draggedType = null;
    if (!type) {
      return;
    }
    const position = this.toCanvasPosition(event);
    if (!position) {
      return;
    }
    await this.spawnNode(type, position);
    this.saveGraph();
  }

  protected async applyInspectorChanges(): Promise<void> {
    if (!this.editor) {
      return;
    }
    const selection = this.selectedNodeSignal();
    if (!selection) {
      return;
    }
    const node = this.editor.getNode(selection.id);
    if (!node) {
      return;
    }

    const { label, type } = this.inspectorForm.getRawValue();
    const trimmedLabel = (label ?? '').trim() || this.generateLabel(selection.type);
    const nextType = (type ?? selection.type) as FlowNodeType;

    const currentLabel = node.label ?? '';
    if (currentLabel !== trimmedLabel) {
      node.label = trimmedLabel;
      await this.area?.update('node', node.id);
    }

    if (nextType !== selection.type) {
      await this.updateNodeType(node, nextType);
    }

    this.refreshCounters();
    this.saveGraph();
    this.selectNode(node.id);
    this.inspectorForm.markAsPristine();
  }

  protected async removeSelectedNode(): Promise<void> {
    if (!this.editor) {
      return;
    }
    const selection = this.selectedNodeSignal();
    if (!selection) {
      return;
    }
    await this.editor.removeNode(selection.id);
    this.nodeTypeMap.delete(selection.id);
    this.refreshCounters();
    this.saveGraph();
    this.selectNode(null);
  }

  protected closeInspector(): void {
    this.selectNode(null);
  }

  private getDraggedType(event: DragEvent): FlowNodeType | null {
    const data = event.dataTransfer?.getData(FlowBuilderPageComponent.DRAG_MIME);
    if (data === 'start' || data === 'agent' || data === 'file-search' || data === 'end') {
      return data;
    }
    return null;
  }

  private async initializeEditor(): Promise<void> {
    const container = this.canvasRef.nativeElement;
    container.innerHTML = '';

    this.nodeTypeMap.clear();
    this.nodeCounters.clear();

    const editor = new NodeEditor<FlowSchemes>();
    const area = new AreaPlugin<FlowSchemes, FlowAreaSignals>(container);
    const angularRenderer = new AngularPlugin<FlowSchemes, FlowAreaSignals>({
      injector: this.injector,
    });
    const connectionPlugin = new ConnectionPlugin<FlowSchemes, FlowAreaSignals>();

    angularRenderer.addPreset(
      AngularPresets.classic.setup({
        customize: {
          node: () => NodeComponent,
          connection: () => ConnectionComponent,
          socket: () => SocketComponent,
          control: () => ControlComponent,
        },
      }),
    );
    connectionPlugin.addPreset(ConnectionPresets.classic.setup());

    editor.use(area);
    area.use(angularRenderer);
    area.use(connectionPlugin);

    AreaExtensions.selectableNodes(
      area,
      AreaExtensions.selector(),
      { accumulating: AreaExtensions.accumulateOnCtrl() },
    );

    editor.addPipe(async (context) => {
      if (!context) {
        return context;
      }
      switch (context.type) {
        case 'nodecreated':
        case 'connectioncreated':
        case 'connectionremoved':
          this.saveGraph();
          break;
        case 'noderemoved':
          this.nodeTypeMap.delete(context.data.id);
          this.refreshCounters();
          this.saveGraph();
        if (this.selectedNodeSignal()?.id === context.data.id) {
          this.selectNode(null);
        }
          break;
        case 'cleared':
          this.nodeTypeMap.clear();
          this.refreshCounters();
          this.saveGraph();
        this.selectNode(null);
          break;
      }
      return context;
    });

    area.addPipe(async (context) => {
      if (context?.type === 'nodetranslated') {
        this.saveGraph();
      }
      if (context?.type === 'nodepicked') {
        this.selectNode(context.data.id);
      }
      return context;
    });

    this.editor = editor;
    this.area = area;
    this.connectionPlugin = connectionPlugin;
    this.angularRenderer = angularRenderer;

    const storedGraph = this.storage.load();
    if (storedGraph) {
      await this.restoreGraph(storedGraph);
    } else {
      await this.seedSampleGraph();
    }

    if (editor.getNodes().length) {
      await AreaExtensions.zoomAt(area, editor.getNodes());
    }
  }

  private async seedSampleGraph(): Promise<void> {
    if (!this.editor || !this.area) {
      return;
    }
    const start = await this.spawnNode('start', { x: 80, y: 220 }, 'Start');
    const mainAgent = await this.spawnNode('agent', { x: 320, y: 200 }, 'My agent');
    const fileSearch = await this.spawnNode('file-search', { x: 560, y: 240 }, 'File Search');
    const finalAgent = await this.spawnNode('agent', { x: 820, y: 200 }, 'Agent');

    if (start && mainAgent && fileSearch && finalAgent) {
      await this.editor.addConnection(
        new ClassicPreset.Connection(start, 'next', mainAgent, 'in'),
      );
      await this.editor.addConnection(
        new ClassicPreset.Connection(mainAgent, 'next', fileSearch, 'in'),
      );
      await this.editor.addConnection(
        new ClassicPreset.Connection(fileSearch, 'next', finalAgent, 'in'),
      );
      this.saveGraph();
    }
  }

  private async restoreGraph(graph: StoredFlowGraph): Promise<void> {
    if (!this.editor || !this.area) {
      return;
    }
    const nodeRefs = new Map<string, ClassicPreset.Node>();

    for (const nodeData of graph.nodes) {
      const node = this.buildNode(nodeData.type, nodeData.label);
      node.id = nodeData.id;
      await this.editor.addNode(node);
      await this.area.translate(node.id, nodeData.position);
      this.registerNode(node, nodeData.type, nodeData.label);
      nodeRefs.set(nodeData.id, node);
    }

    for (const connectionData of graph.connections) {
      const source = nodeRefs.get(connectionData.source.nodeId);
      const target = nodeRefs.get(connectionData.target.nodeId);
      if (!source || !target) {
        continue;
      }
      await this.editor.addConnection(
        new ClassicPreset.Connection(
          source,
          connectionData.source.output as string,
          target,
          connectionData.target.input as string,
        ),
      );
    }

    this.saveGraph();
  }

  private async spawnNode(
    type: FlowNodeType,
    position: { x: number; y: number },
    label?: string,
  ): Promise<ClassicPreset.Node | undefined> {
    if (!this.editor || !this.area) {
      return undefined;
    }
    const node = this.buildNode(type, label);
    await this.editor.addNode(node);
    await this.area.translate(node.id, position);
    this.registerNode(node, type, node.label);
    this.selectNode(node.id);
    return node;
  }

  private buildNode(type: FlowNodeType, label?: string): ClassicPreset.Node {
    const nodeLabel = label ?? this.generateLabel(type);
    const node = new ClassicPreset.Node(nodeLabel);
    switch (type) {
      case 'start':
        node.addOutput('next', new ClassicPreset.Output(this.flowSocket, 'Next'));
        break;
      case 'agent':
        node.addInput('in', new ClassicPreset.Input(this.flowSocket, 'Input'));
        node.addOutput('next', new ClassicPreset.Output(this.flowSocket, 'Next'));
        break;
      case 'file-search':
        node.addInput('in', new ClassicPreset.Input(this.flowSocket, 'Input'));
        node.addOutput('next', new ClassicPreset.Output(this.flowSocket, 'Next'));
        break;
      case 'end':
        node.addInput('in', new ClassicPreset.Input(this.flowSocket, 'Input'));
        break;
    }
    return node;
  }

  private registerNode(node: ClassicPreset.Node, type: FlowNodeType, label: string): void {
    const index = this.extractIndex(type, label);
    const current = this.nodeCounters.get(type) ?? 0;
    this.nodeCounters.set(type, Math.max(current, index));
    this.nodeTypeMap.set(node.id, type);
  }

  private generateLabel(type: FlowNodeType): string {
    const base = this.baseLabels[type];
    const next = (this.nodeCounters.get(type) ?? 0) + 1;
    return next === 1 ? base : `${base} ${next}`;
  }

  private extractIndex(type: FlowNodeType, label: string): number {
    const base = this.baseLabels[type];
    if (label === base) {
      return 1;
    }
    const suffix = label.slice(base.length).trim();
    const parsed = Number.parseInt(suffix, 10);
    return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
  }

  private refreshCounters(): void {
    this.nodeCounters.clear();
    for (const [nodeId, type] of this.nodeTypeMap.entries()) {
      const node = this.editor?.getNode(nodeId);
      if (!node) {
        continue;
      }
      const label = node.label ?? this.baseLabels[type];
      const index = this.extractIndex(type, label);
      const current = this.nodeCounters.get(type) ?? 0;
      if (index > current) {
        this.nodeCounters.set(type, index);
      }
    }
  }

  private toCanvasPosition(event: DragEvent): { x: number; y: number } | null {
    if (!this.area) {
      return null;
    }
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const transform = this.area.area.transform;
    const x = (event.clientX - rect.left - transform.x) / transform.k;
    const y = (event.clientY - rect.top - transform.y) / transform.k;
    return { x, y };
  }

  private saveGraph(): void {
    if (!this.editor || !this.area) {
      return;
    }
    const nodes: StoredFlowNode[] = [];
    for (const node of this.editor.getNodes()) {
      const type = this.nodeTypeMap.get(node.id);
      if (!type) {
        continue;
      }
      const view = this.area.nodeViews.get(node.id);
      nodes.push({
        id: node.id,
        type,
        label: node.label,
        position: {
          x: view?.position.x ?? 0,
          y: view?.position.y ?? 0,
        },
      });
    }

    const connections: StoredFlowConnection[] = this.editor.getConnections().map((connection) => ({
      id: connection.id,
      source: {
        nodeId: connection.source,
        output: connection.sourceOutput as string,
      },
      target: {
        nodeId: connection.target,
        input: connection.targetInput as string,
      },
    }));

    this.storage.save({ nodes, connections });
  }

  private dispose(): void {
    this.connectionPlugin?.drop?.();
    this.area?.destroy();
    this.angularRenderer = undefined;
    this.connectionPlugin = undefined;
    this.area = undefined;
    this.editor = undefined;
  }

  private selectNode(nodeId: string | null): void {
    if (!nodeId) {
      this.selectedNodeSignal.set(null);
      this.inspectorForm.reset({ label: '', type: 'agent' });
      return;
    }
    const node = this.editor?.getNode(nodeId);
    const type = this.nodeTypeMap.get(nodeId);
    if (!node || !type) {
      this.selectedNodeSignal.set(null);
      this.inspectorForm.reset({ label: '', type: 'agent' });
      return;
    }
    this.selectedNodeSignal.set({ id: nodeId, type });
    this.inspectorForm.setValue({
      label: node.label ?? '',
      type,
    });
    this.inspectorForm.markAsPristine();
  }

  private async updateNodeType(node: ClassicPreset.Node, newType: FlowNodeType): Promise<void> {
    if (!this.editor) {
      return;
    }
    const currentType = this.nodeTypeMap.get(node.id);
    if (currentType === newType) {
      return;
    }

    const connections = this.editor
      .getConnections()
      .filter((connection) => connection.source === node.id || connection.target === node.id);

    for (const connection of connections) {
      await this.editor.removeConnection(connection.id);
    }

    Object.keys(node.inputs).forEach((key) => node.removeInput(key as keyof typeof node.inputs));
    Object.keys(node.outputs).forEach((key) => node.removeOutput(key as keyof typeof node.outputs));

    switch (newType) {
      case 'start':
        node.addOutput('next', new ClassicPreset.Output(this.flowSocket, 'Next'));
        break;
      case 'agent':
        node.addInput('in', new ClassicPreset.Input(this.flowSocket, 'Input'));
        node.addOutput('next', new ClassicPreset.Output(this.flowSocket, 'Next'));
        break;
      case 'file-search':
        node.addInput('in', new ClassicPreset.Input(this.flowSocket, 'Input'));
        node.addOutput('next', new ClassicPreset.Output(this.flowSocket, 'Next'));
        break;
      case 'end':
        node.addInput('in', new ClassicPreset.Input(this.flowSocket, 'Input'));
        break;
    }

    const baseLabel = this.baseLabels[newType];
    if (!node.label || node.label === this.baseLabels[currentType ?? newType]) {
      node.label = this.generateLabel(newType);
    }

    this.nodeTypeMap.set(node.id, newType);
    await this.area?.update('node', node.id);
  }
}

