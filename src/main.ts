/**
 * Arquivo de exemplo para testar o agente de navegação de arquivos
 * Este arquivo demonstra um exemplo simples de código TypeScript
 */

export interface User {
  id: number;
  name: string;
  email: string;
}

export class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
    console.log(`Usuário ${user.name} adicionado com sucesso!`);
  }

  getUserById(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }

  getAllUsers(): User[] {
    return this.users;
  }
}

// Exemplo de uso
const userService = new UserService();

userService.addUser({
  id: 1,
  name: 'João Silva',
  email: 'joao@example.com'
});

console.log('Usuários cadastrados:', userService.getAllUsers());

