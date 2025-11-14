import { Component, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

type MenuItem = {
  label: string;
  icon?: string;
  route: string;
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private readonly itemsSignal = signal<MenuItem[]>([
    { label: 'Chat', icon: '💬', route: '/chat' },
    { label: 'Agentes', icon: '🧠', route: '/agents' },
    { label: 'Flow Builder', icon: '🌀', route: '/flow-builder' },
    { label: 'Configurações', icon: '⚙️', route: '/config' },
    { label: 'Tokens', icon: '💰', route: '/tokens' },
    { label: 'Logs', icon: '📜', route: '/logs' },
    { label: 'Monitor', icon: '🔍', route: '/monitor' },
  ]);

  protected readonly menuItems = computed(() => this.itemsSignal());
}

