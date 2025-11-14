import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { Socket } from 'socket.io';

const execAsync = promisify(exec);

// Comandos perigosos que devem ser bloqueados
const DANGEROUS_COMMANDS = [
  'format',
  'del /f /s /q',
  'rm -rf',
  'rmdir /s /q',
  'shutdown',
  'restart',
  'reboot',
  'chkdsk /f',
  'sfc /scannow'
];

// Comandos permitidos (whitelist básica para segurança)
const ALLOWED_COMMANDS_PATTERNS = [
  /^npm\s+/,
  /^node\s+/,
  /^yarn\s+/,
  /^cd\s+/,
  /^dir\s*/,
  /^ls\s*/,
  /^echo\s+/,
  /^type\s+/,
  /^net\s+start/,
  /^net\s+stop/,
  /^netstat\s+/,
  /^findstr\s+/,
  /^taskkill\s+/,
  /^git\s+/,
  /^docker\s+/,
  /^python\s+/,
  /^pip\s+/,
  /^dotnet\s+/,
  /^npx\s+/,
  /^tsc\s+/,
  /^ts-node\s+/,
  /^ng\s+/,
  /^react-scripts\s+/,
  /^vue\s+/,
  /^next\s+/,
  /^nest\s+/,
  /^serve\s+/,
  /^http-server\s+/,
  /^jest\s+/,
  /^karma\s+/,
  /^mocha\s+/,
  /^vitest\s+/,
  /^cypress\s+/,
  /^playwright\s+/,
  /^jasmine\s+/
];

/**
 * Verifica se um comando é seguro para executar
 */
function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const lowerCommand = command.toLowerCase().trim();

  // Bloqueia comandos perigosos
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (lowerCommand.includes(dangerous.toLowerCase())) {
      return { safe: false, reason: `Comando perigoso detectado: ${dangerous}` };
    }
  }

  // Verifica se o comando está na whitelist ou começa com um padrão permitido
  const isAllowed = ALLOWED_COMMANDS_PATTERNS.some(pattern => pattern.test(command));

  // Lista de comandos base que sempre são permitidos (mesmo se não estiverem na whitelist)
  const alwaysAllowedPrefixes = ['npm ', 'node ', 'yarn ', 'jest ', 'karma ', 'mocha ', 'vitest '];
  const startsWithAllowed = alwaysAllowedPrefixes.some(prefix => lowerCommand.startsWith(prefix));

  if (!isAllowed && !startsWithAllowed) {
    return { safe: false, reason: 'Comando não permitido. Apenas comandos de desenvolvimento são permitidos.' };
  }

  return { safe: true };
}

/**
 * Executa um comando no terminal do Windows com streaming em tempo real
 */
export async function executeCommand(
  command: string, 
  workingDirectory?: string,
  socket?: Socket
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Verifica segurança do comando
      const safetyCheck = isCommandSafe(command);
      if (!safetyCheck.safe) {
        const errorMsg = `❌ Erro de segurança: ${safetyCheck.reason}`;
        if (socket) {
          socket.emit('terminal_output', {
            type: 'error',
            content: errorMsg,
            isComplete: true
          });
        }
        return resolve(errorMsg);
      }

      // Emite início do comando
      if (socket) {
        socket.emit('terminal_output', {
          type: 'start',
          content: `⚡ Executando: ${command}${workingDirectory ? `\n📁 Diretório: ${workingDirectory}` : ''}\n`,
          isComplete: false
        });
      }

      // Divide o comando em partes para spawn
      const parts = command.split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);

      const options: any = {
        cwd: workingDirectory || process.cwd(),
        shell: true, // Usa shell para Windows
        env: process.env
      };

      // Usa spawn para streaming em tempo real
      const childProcess = spawn(cmd, args, options);
      
      let fullOutput = '';
      let fullError = '';

      // Stream stdout em tempo real
      childProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        fullOutput += output;
        
        if (socket) {
          socket.emit('terminal_output', {
            type: 'stdout',
            content: output,
            isComplete: false
          });
        }
      });

      // Stream stderr em tempo real
      childProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        fullError += output;
        
        if (socket) {
          socket.emit('terminal_output', {
            type: 'stderr',
            content: output,
            isComplete: false
          });
        }
      });

      // Quando o processo termina
      childProcess.on('close', (code: number | null) => {
        let result = '';
        
        if (fullOutput) {
          result += fullOutput;
        }
        
        if (fullError) {
          result += fullError;
        }

        if (!result && code === 0) {
          result = '✅ Comando executado com sucesso (sem saída)';
        }

        if (code !== 0 && !fullError) {
          result = `❌ Comando falhou com código de saída: ${code}`;
        }

        if (socket) {
          socket.emit('terminal_output', {
            type: code === 0 ? 'success' : 'error',
            content: `\n\n${code === 0 ? '✅' : '❌'} Processo finalizado (código: ${code})`,
            isComplete: true,
            exitCode: code
          });
        }

        resolve(result || `Comando executado (código: ${code})`);
      });

      // Trata erros do processo
      childProcess.on('error', (error: Error) => {
        const errorMsg = `❌ Erro ao executar comando: ${error.message}`;
        
        if (socket) {
          socket.emit('terminal_output', {
            type: 'error',
            content: errorMsg,
            isComplete: true
          });
        }
        
        reject(new Error(errorMsg));
      });

      // Timeout de 5 minutos
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill();
          const timeoutMsg = '⏱️ Comando interrompido: timeout de 5 minutos excedido';
          
          if (socket) {
            socket.emit('terminal_output', {
              type: 'error',
              content: `\n\n${timeoutMsg}`,
              isComplete: true
            });
          }
          
          resolve(timeoutMsg);
        }
      }, 300000); // 5 minutos

    } catch (error: any) {
      const errorMsg = `❌ Erro ao executar comando: ${error.message}`;
      
      if (socket) {
        socket.emit('terminal_output', {
          type: 'error',
          content: errorMsg,
          isComplete: true
        });
      }
      
      reject(error);
    }
  });
}

/**
 * Verifica se um serviço está rodando
 */
export async function checkServiceStatus(serviceName: string): Promise<string> {
  try {
    const command = `sc query "${serviceName}"`;
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      return `❌ Erro ao verificar serviço: ${stderr}`;
    }

    if (stdout.includes('RUNNING')) {
      return `✅ Serviço "${serviceName}" está rodando`;
    } else if (stdout.includes('STOPPED')) {
      return `⏹️ Serviço "${serviceName}" está parado`;
    } else {
      return `❓ Status do serviço "${serviceName}":\n${stdout}`;
    }
  } catch (error: any) {
    return `❌ Erro ao verificar serviço: ${error.message}`;
  }
}

/**
 * Inicia um serviço do Windows
 */
export async function startService(serviceName: string): Promise<string> {
  try {
    const command = `net start "${serviceName}"`;
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      return `❌ Erro ao iniciar serviço: ${stderr}`;
    }

    return `✅ Serviço "${serviceName}" iniciado com sucesso\n${stdout || ''}`;
  } catch (error: any) {
    return `❌ Erro ao iniciar serviço: ${error.message}\n${error.stderr || ''}`;
  }
}

/**
 * Para um serviço do Windows
 */
export async function stopService(serviceName: string): Promise<string> {
  try {
    const command = `net stop "${serviceName}"`;
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      return `❌ Erro ao parar serviço: ${stderr}`;
    }

    return `✅ Serviço "${serviceName}" parado com sucesso\n${stdout || ''}`;
  } catch (error: any) {
    return `❌ Erro ao parar serviço: ${error.message}\n${error.stderr || ''}`;
  }
}

/**
 * Mata um processo que está usando uma porta específica
 */
export async function killProcessOnPort(port: number): Promise<string> {
  try {
    // Primeiro, encontra o PID do processo que está usando a porta
    const findCommand = `netstat -aon | findstr :${port}`;
    const { stdout: netstatOutput } = await execAsync(findCommand);

    if (!netstatOutput || netstatOutput.trim().length === 0) {
      return `ℹ️ Nenhum processo encontrado usando a porta ${port}`;
    }

    // Extrai os PIDs do output do netstat
    // Formato: "TCP    0.0.0.0:3300    0.0.0.0:0    LISTENING    12345"
    // Pode ter múltiplas linhas, então extraímos todos os PIDs únicos
    const lines = netstatOutput.trim().split('\n');
    const pids = new Set<string>();
    
    for (const line of lines) {
      // O PID é sempre o último número na linha
      const match = line.trim().match(/\s+(\d+)\s*$/);
      if (match) {
        pids.add(match[1]);
      }
    }

    if (pids.size === 0) {
      return `❌ Não foi possível extrair o PID do processo usando a porta ${port}\nOutput: ${netstatOutput}`;
    }

    // Mata todos os processos encontrados
    const results: string[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const pid of pids) {
      try {
        const killCommand = `taskkill /F /PID ${pid}`;
        const { stdout: killOutput, stderr: killError } = await execAsync(killCommand);

        if (killError && !killOutput.includes('SUCCESS') && !killOutput.includes('terminado')) {
          results.push(`⚠️ Erro ao matar processo PID ${pid}: ${killError}`);
          failCount++;
        } else {
          results.push(`✅ Processo PID ${pid} encerrado`);
          successCount++;
        }
      } catch (error: any) {
        results.push(`⚠️ Erro ao matar processo PID ${pid}: ${error.message}`);
        failCount++;
      }
    }

    if (successCount > 0) {
      return `✅ ${successCount} processo(s) na porta ${port} foi(ram) encerrado(s) com sucesso\n${results.join('\n')}`;
    } else {
      return `❌ Não foi possível encerrar os processos na porta ${port}\n${results.join('\n')}`;
    }
  } catch (error: any) {
    // Se não encontrou processo, retorna mensagem amigável
    if (error.message && (error.message.includes('findstr') || error.code === 1)) {
      return `ℹ️ Nenhum processo encontrado usando a porta ${port}`;
    }
    return `❌ Erro ao matar processo na porta ${port}: ${error.message}`;
  }
}

// Define as tools (funções) disponíveis para o assistente
export const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'execute_command',
      description: 'Executa um comando no terminal do Windows. Use para executar comandos npm, node, yarn, git, docker, etc. IMPORTANTE: Apenas comandos de desenvolvimento são permitidos por segurança.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Comando a ser executado (ex: "npm start", "node server.js", "npm run dev")'
          },
          workingDirectory: {
            type: 'string',
            description: 'Diretório onde o comando será executado (opcional). Caminho absoluto ou relativo.'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_service_status',
      description: 'Verifica o status de um serviço do Windows',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'Nome do serviço do Windows a verificar'
          }
        },
        required: ['serviceName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_service',
      description: 'Inicia um serviço do Windows',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'Nome do serviço do Windows a iniciar'
          }
        },
        required: ['serviceName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'stop_service',
      description: 'Para um serviço do Windows',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'Nome do serviço do Windows a parar'
          }
        },
        required: ['serviceName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'kill_process_on_port',
      description: 'Mata um processo que está usando uma porta específica. Útil para liberar portas ocupadas por serviços em desenvolvimento.',
      parameters: {
        type: 'object',
        properties: {
          port: {
            type: 'number',
            description: 'Número da porta do processo a ser encerrado (ex: 3300, 3000, 8080)'
          }
        },
        required: ['port']
      }
    }
  }
];

