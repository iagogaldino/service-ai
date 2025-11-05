/**
 * Utilitário para mapear nomes de funções para descrições amigáveis
 * 
 * Este módulo fornece mapeamentos de nomes de funções/tools para
 * mensagens descritivas que são exibidas ao usuário durante a execução.
 */

/**
 * Interface para informações de descrição de função
 */
export interface FunctionDescription {
  /** Emoji ou ícone para a função */
  emoji: string;
  /** Descrição amigável da função */
  description: string;
}

/**
 * Mapeamento de nomes de funções para suas descrições
 */
const FUNCTION_DESCRIPTIONS: Record<string, FunctionDescription> = {
  'list_directory': {
    emoji: '📁',
    description: 'Listando diretório'
  },
  'read_file': {
    emoji: '📄',
    description: 'Lendo arquivo'
  },
  'find_file': {
    emoji: '🔍',
    description: 'Procurando arquivo'
  },
  'detect_framework': {
    emoji: '🔍',
    description: 'Detectando framework'
  },
  'write_file': {
    emoji: '✍️',
    description: 'Criando/Editando arquivo'
  },
  'execute_command': {
    emoji: '⚡',
    description: 'Executando comando'
  },
  'check_service_status': {
    emoji: '🔍',
    description: 'Verificando status do serviço'
  },
  'start_service': {
    emoji: '▶️',
    description: 'Iniciando serviço'
  },
  'stop_service': {
    emoji: '⏹️',
    description: 'Parando serviço'
  }
};

/**
 * Obtém a descrição de uma função pelo nome
 * 
 * @param {string} functionName - Nome da função
 * @returns {FunctionDescription} Descrição da função ou descrição padrão
 */
export function getFunctionDescription(functionName: string): FunctionDescription {
  return FUNCTION_DESCRIPTIONS[functionName] || {
    emoji: '⚙️',
    description: functionName
  };
}

/**
 * Gera uma mensagem de ação amigável para uma função
 * 
 * @param {string} functionName - Nome da função
 * @param {any} args - Argumentos da função
 * @returns {string} Mensagem formatada para exibição
 */
export function formatActionMessage(functionName: string, args: any): string {
  const funcDesc = getFunctionDescription(functionName);
  let message = `${funcDesc.emoji} ${funcDesc.description}`;

  // Adiciona detalhes específicos baseado na função
  switch (functionName) {
    case 'list_directory':
      message = `📁 Listando arquivos em: ${args.dirPath}`;
      break;
    case 'read_file':
      message = `📄 Lendo arquivo: ${args.filePath}`;
      break;
    case 'find_file':
      message = `🔍 Procurando arquivo: "${args.fileName}"`;
      break;
    case 'detect_framework':
      message = `🔍 Detectando framework em: ${args.projectPath}`;
      break;
    case 'write_file':
      message = `✍️ Criando/Editando arquivo: ${args.filePath}`;
      break;
    case 'execute_command':
      message = `⚡ Executando comando: ${args.command}`;
      if (args.workingDirectory) {
        message += ` (em: ${args.workingDirectory})`;
      }
      break;
    case 'check_service_status':
      message = `🔍 Verificando status do serviço: ${args.serviceName}`;
      break;
    case 'start_service':
      message = `▶️ Iniciando serviço: ${args.serviceName}`;
      break;
    case 'stop_service':
      message = `⏹️ Parando serviço: ${args.serviceName}`;
      break;
    default:
      message += '...';
  }

  return message;
}

