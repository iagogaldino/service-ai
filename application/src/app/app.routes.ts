import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'chat',
      },
      {
        path: 'chat',
        loadComponent: () =>
          import('./features/chat/chat-page.component').then((m) => m.ChatPageComponent),
      },
      {
        path: 'agents',
        loadComponent: () =>
          import('./features/agents/agents-page.component').then((m) => m.AgentsPageComponent),
      },
      {
        path: 'config',
        loadComponent: () =>
          import('./features/config/config-page.component').then((m) => m.ConfigPageComponent),
      },
      {
        path: 'tokens',
        loadComponent: () =>
          import('./features/tokens/tokens-page.component').then((m) => m.TokensPageComponent),
      },
      {
        path: 'logs',
        loadComponent: () =>
          import('./features/logs/logs-page.component').then((m) => m.LogsPageComponent),
      },
      {
        path: 'flow-builder',
        loadComponent: () =>
          import('./features/flow-builder/flow-builder-page.component').then(
            (m) => m.FlowBuilderPageComponent,
          ),
      },
      {
        path: 'monitor',
        loadComponent: () =>
          import('./features/monitor/monitor-page.component').then((m) => m.MonitorPageComponent),
      },
      {
        path: '**',
        redirectTo: 'chat',
      },
    ],
  },
];
