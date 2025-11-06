/**
 * Parser de Function Calling para StackSpot
 * 
 * Como o StackSpot não suporta function calling nativo, este módulo
 * analisa as respostas do agente e detecta quando ele quer executar
 * ferramentas, executando-as automaticamente através de callbacks.
 */

import { ToolExecutor } from '../types';

export interface DetectedFunctionCall {
  functionName: string;
  arguments: Record<string, any>;
  confidence: number;
}

export interface FunctionExecutionResult {
  functionName: string;
  result: string;
  success: boolean;
}

/**
 * Padrões para detectar chamadas de função na resposta do agente
 */
const FUNCTION_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  extractArgs: (match: RegExpMatchArray) => Record<string, any>;
}> = [
  // Padrão 1a: write_file path=... content=... (formato inline)
  {
    name: 'write_file',
    pattern: /write_file\s+path\s*=\s*([^\s\n]+)\s+content\s*=\s*([\s\S]*?)(?=\n---|\nwrite_file|\nread_file|\nlist_directory|\nfind_file|\nexecute_command|Todos os arquivos|$)/i,
    extractArgs: (match) => {
      let content = match[2]?.trim() || '';
      // Remove marcadores de código se presentes
      content = content.replace(/^```[\w]*\n?/g, '').replace(/\n?```$/g, '');
      content = content.replace(/^\n+|\n+$/g, '');
      return {
        filePath: match[1].trim(),
        content: content,
        createDirectories: true,
      };
    },
  },
  // Padrão 1b: write_file path=...\nconteúdo (formato multilinha - conteúdo na próxima linha)
  {
    name: 'write_file',
    pattern: /write_file\s+path\s*=\s*([^\s\n]+)\s*\n([\s\S]*?)(?=\n---|\nwrite_file|\nread_file|\nlist_directory|\nfind_file|\nexecute_command|Todos os arquivos|$)/i,
    extractArgs: (match) => {
      let content = match[2]?.trim() || '';
      // Remove "content=" se presente no início
      content = content.replace(/^content\s*=\s*/i, '');
      // Remove marcadores de código se presentes (```json, ```typescript, etc)
      content = content.replace(/^```[\w]*\n?/g, '').replace(/\n?```$/g, '');
      // Remove linhas vazias no início e fim
      content = content.replace(/^\n+|\n+$/g, '');
      return {
        filePath: match[1].trim(),
        content: content,
        createDirectories: true,
      };
    },
  },
  // Padrão 2: read_file path=...
  {
    name: 'read_file',
    pattern: /read_file\s+path\s*=\s*([^\s\n]+)/i,
    extractArgs: (match) => ({
      filePath: match[1].trim(),
    }),
  },
  // Padrão 3: list_directory dirPath=...
  {
    name: 'list_directory',
    pattern: /list_directory\s+dirPath\s*=\s*([^\s\n]+)/i,
    extractArgs: (match) => ({
      dirPath: match[1].trim(),
    }),
  },
  // Padrão 4: find_file fileName=... startDir=...
  {
    name: 'find_file',
    pattern: /find_file\s+fileName\s*=\s*([^\s\n]+)(?:\s+startDir\s*=\s*([^\s\n]+))?/i,
    extractArgs: (match) => ({
      fileName: match[1].trim(),
      startDir: match[2]?.trim() || '.',
    }),
  },
  // Padrão 5: execute_command command=...
  {
    name: 'execute_command',
    pattern: /execute_command\s+command\s*=\s*([^\n]+)/i,
    extractArgs: (match) => ({
      command: match[1].trim(),
    }),
  },
  // Padrão 6: Formato JSON explícito [TOOL:function_name] {...} [/TOOL]
  {
    name: 'json_tool',
    pattern: /\[TOOL:(\w+)\]\s*([\s\S]*?)\s*\[\/TOOL\]/i,
    extractArgs: (match) => {
      try {
        const args = JSON.parse(match[2].trim());
        return args;
      } catch {
        return {};
      }
    },
  },
];

/**
 * Detecta chamadas de função na resposta do agente
 */
export function detectFunctionCalls(response: string): DetectedFunctionCall[] {
  const detected: DetectedFunctionCall[] = [];

  for (const funcPattern of FUNCTION_PATTERNS) {
    const matches = response.matchAll(new RegExp(funcPattern.pattern, 'gi'));
    
    for (const match of matches) {
      try {
        let functionName: string;
        let args: Record<string, any>;
        
        if (funcPattern.name === 'json_tool') {
          // Para JSON, o nome da função está no primeiro grupo
          functionName = match[1];
          args = funcPattern.extractArgs(match);
        } else {
          functionName = funcPattern.name;
          args = funcPattern.extractArgs(match);
        }
        
        // Valida se tem argumentos válidos
        if (Object.keys(args).length > 0) {
          detected.push({
            functionName,
            arguments: args,
            confidence: 0.8, // Alta confiança quando padrão é encontrado
          });
        }
      } catch (error) {
        console.warn(`⚠️ Erro ao extrair argumentos de ${funcPattern.name}:`, error);
      }
    }
  }

  return detected;
}

/**
 * Executa chamadas de função detectadas usando um executor fornecido
 */
export async function executeDetectedFunctions(
  functionCalls: DetectedFunctionCall[],
  executor: ToolExecutor
): Promise<FunctionExecutionResult[]> {
  const results: FunctionExecutionResult[] = [];

  for (const funcCall of functionCalls) {
    try {
      console.log(`🔧 [SDK] Executando função detectada: ${funcCall.functionName}`, funcCall.arguments);
      
      const result = await executor(funcCall.functionName, funcCall.arguments);
      
      results.push({
        functionName: funcCall.functionName,
        result,
        success: !result.startsWith('Erro:'),
      });
      
      console.log(`✅ [SDK] Função ${funcCall.functionName} executada com sucesso`);
    } catch (error: any) {
      console.error(`❌ [SDK] Erro ao executar ${funcCall.functionName}:`, error.message);
      results.push({
        functionName: funcCall.functionName,
        result: `Erro: ${error.message}`,
        success: false,
      });
    }
  }

  return results;
}

/**
 * Formata resultados de funções para enviar de volta ao agente
 */
export function formatFunctionResults(
  results: FunctionExecutionResult[]
): string {
  if (results.length === 0) {
    return '';
  }

  let formatted = '\n\n[Resultados das funções executadas]:\n';
  
  for (const result of results) {
    formatted += `\n${result.success ? '✅' : '❌'} ${result.functionName}:\n`;
    formatted += result.result.substring(0, 1000);
    if (result.result.length > 1000) {
      formatted += '...\n[Resultado truncado]';
    }
    formatted += '\n';
  }

  return formatted;
}

