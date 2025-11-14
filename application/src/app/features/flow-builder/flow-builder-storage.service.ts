import { Injectable } from '@angular/core';
import { StoredFlowGraph } from './flow-builder.types';

const STORAGE_KEY = 'serviceia.flow-builder.graph';

@Injectable({ providedIn: 'root' })
export class FlowBuilderStorageService {
  load(): StoredFlowGraph | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as StoredFlowGraph;
      if (!parsed?.nodes || !Array.isArray(parsed.nodes)) {
        return null;
      }
      return parsed;
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  save(graph: StoredFlowGraph): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
    } catch {
      // Silently ignore storage errors (quota, private mode etc.)
    }
  }

  clear(): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

