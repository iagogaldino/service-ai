import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

// Diretório base do projeto (raiz do workspace)
export const PROJECT_ROOT = process.cwd();

/**
 * Verifica se um caminho está dentro de um diretório permitido
 */
function isPathAllowed(filePath: string): boolean {
  const normalizedPath = path.normalize(filePath);
  
  // Bloqueia caminhos perigosos do sistema
  const dangerousPaths = [
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/var',
    '/sys',
    '/root'
  ];
  
  for (const dangerous of dangerousPaths) {
    if (normalizedPath.toLowerCase().startsWith(dangerous.toLowerCase())) {
      return false;
    }
  }
  
  // Permite caminhos no Desktop, Documents, Projects, ou subdiretórios do usuário
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  if (userProfile) {
    const allowedBasePaths = [
      path.join(userProfile, 'Desktop'),
      path.join(userProfile, 'Documents'),
      path.join(userProfile, 'Projects'),
      path.join(userProfile, 'Downloads'),
      PROJECT_ROOT
    ];
    
    for (const allowedDir of allowedBasePaths) {
      const normalizedAllowed = path.normalize(allowedDir);
      if (normalizedPath.toLowerCase().startsWith(normalizedAllowed.toLowerCase())) {
        return true;
      }
    }
  }
  
  // Permite caminhos que começam com C:\Users (Windows) ou /home (Linux/Mac)
  // mas apenas dentro de diretórios seguros do usuário
  if (normalizedPath.match(/^[Cc]:\\Users\\[^\\]+/i) || 
      normalizedPath.match(/^\/home\/[^\/]+/i) ||
      normalizedPath.match(/^\/Users\/[^\/]+/i)) {
    // Verifica se não está em diretórios perigosos
    return !dangerousPaths.some(dangerous => 
      normalizedPath.toLowerCase().includes(dangerous.toLowerCase())
    );
  }
  
  // Permite acesso ao próprio diretório do projeto
  if (normalizedPath.startsWith(path.normalize(PROJECT_ROOT))) {
    return true;
  }
  
  // Por padrão, nega acesso (mais seguro)
  return false;
}

/**
 * Resolve um caminho, aceitando tanto relativos quanto absolutos
 */
function resolvePath(inputPath: string, basePath: string = PROJECT_ROOT): string {
  // Se for caminho absoluto, usa diretamente
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }
  // Caso contrário, resolve relativo ao basePath
  return path.resolve(basePath, inputPath);
}

// Funções para navegação de arquivos
export const fileSystemFunctions = {
  // Lista arquivos e diretórios em um caminho
  async listDirectory(dirPath: string): Promise<string> {
    try {
      const fullPath = resolvePath(dirPath);
      
      // Verifica se o caminho está permitido
      if (!isPathAllowed(fullPath)) {
        return `Erro: Acesso negado. Caminho não permitido por questões de segurança: ${dirPath}`;
      }

      if (!existsSync(fullPath)) {
        return `Erro: Diretório não encontrado: ${dirPath}`;
      }

      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) {
        return `Erro: O caminho não é um diretório: ${dirPath}`;
      }

      const items = await fs.readdir(fullPath);
      const details = await Promise.all(
        items.map(async (item) => {
          const itemPath = path.join(fullPath, item);
          const itemStats = await fs.stat(itemPath);
          const type = itemStats.isDirectory() ? '[DIR]' : '[FILE]';
          const size = itemStats.isFile() ? ` (${itemStats.size} bytes)` : '';
          return `${type} ${item}${size}`;
        })
      );

      return `Conteúdo de ${dirPath}:\n${details.join('\n')}`;
    } catch (error: any) {
      return `Erro ao listar diretório: ${error.message}`;
    }
  },

  // Lê o conteúdo de um arquivo
  async readFile(filePath: string): Promise<string> {
    try {
      const fullPath = resolvePath(filePath);
      
      // Verifica se o caminho está permitido
      if (!isPathAllowed(fullPath)) {
        return `Erro: Acesso negado. Caminho não permitido por questões de segurança: ${filePath}`;
      }

      if (!existsSync(fullPath)) {
        return `Erro: Arquivo não encontrado: ${filePath}`;
      }

      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) {
        return `Erro: O caminho não é um arquivo: ${filePath}`;
      }

      // Limita tamanho de arquivo para 1MB
      if (stats.size > 1024 * 1024) {
        return `Erro: Arquivo muito grande (${Math.round(stats.size / 1024)}KB). Limite: 1MB.`;
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      return `Conteúdo do arquivo ${filePath}:\n\n${content}`;
    } catch (error: any) {
      return `Erro ao ler arquivo: ${error.message}`;
    }
  },

  // Procura arquivos por nome no projeto
  async findFile(fileName: string, startDir: string = '.'): Promise<string> {
    try {
      const fullStartPath = resolvePath(startDir);
      
      if (!isPathAllowed(fullStartPath)) {
        return `Erro: Acesso negado. Caminho não permitido por questões de segurança: ${startDir}`;
      }

      const foundFiles: string[] = [];

      async function searchDirectory(dir: string): Promise<void> {
        try {
          const items = await fs.readdir(dir);
          
          for (const item of items) {
            const itemPath = path.join(dir, item);
            const relativePath = path.relative(fullStartPath, itemPath) || item;
            
            // Ignora node_modules e outras pastas comuns
            if (relativePath.includes('node_modules') || 
                relativePath.includes('.git') ||
                relativePath.includes('dist')) {
              continue;
            }

            try {
              const stats = await fs.stat(itemPath);
              
              if (stats.isDirectory()) {
                await searchDirectory(itemPath);
              } else if (stats.isFile() && item.includes(fileName)) {
                foundFiles.push(relativePath);
              }
            } catch {
              // Ignora erros de permissão
              continue;
            }
          }
        } catch {
          // Ignora erros de diretório
        }
      }

      await searchDirectory(fullStartPath);

      if (foundFiles.length === 0) {
        return `Nenhum arquivo encontrado com o nome contendo "${fileName}" em ${startDir}`;
      }

      return `Arquivos encontrados contendo "${fileName}":\n${foundFiles.map(f => `- ${f}`).join('\n')}`;
    } catch (error: any) {
      return `Erro ao procurar arquivo: ${error.message}`;
    }
  },

  // Cria ou edita um arquivo
  async writeFile(filePath: string, content: string, createDirectories: boolean = true): Promise<string> {
    try {
      const fullPath = resolvePath(filePath);
      
      // Verifica se o caminho está permitido
      if (!isPathAllowed(fullPath)) {
        return `Erro: Acesso negado. Caminho não permitido por questões de segurança: ${filePath}`;
      }

      // Verifica se o diretório existe, se não, cria (se permitido)
      const dirPath = path.dirname(fullPath);
      if (!existsSync(dirPath)) {
        if (createDirectories) {
          // Verifica se o diretório pai está permitido
          if (!isPathAllowed(dirPath)) {
            return `Erro: Acesso negado. Não é possível criar diretório em: ${dirPath}`;
          }
          await fs.mkdir(dirPath, { recursive: true });
        } else {
          return `Erro: Diretório não existe: ${dirPath}`;
        }
      }

      // Verifica se o arquivo já existe
      const fileExists = existsSync(fullPath);
      
      // Escreve o arquivo
      await fs.writeFile(fullPath, content, 'utf-8');
      
      const status = fileExists ? 'atualizado' : 'criado';
      return `✅ Arquivo ${status} com sucesso: ${filePath}\n\nTamanho: ${content.length} caracteres`;
    } catch (error: any) {
      return `Erro ao escrever arquivo: ${error.message}`;
    }
  },

  // Detecta o framework de um projeto
  async detectFramework(projectPath: string): Promise<string> {
    try {
      const fullPath = resolvePath(projectPath);
      
      if (!isPathAllowed(fullPath)) {
        return `Erro: Acesso negado. Caminho não permitido: ${projectPath}`;
      }

      if (!existsSync(fullPath)) {
        return `Erro: Diretório não encontrado: ${projectPath}`;
      }

      const packageJsonPath = path.join(fullPath, 'package.json');
      
      if (!existsSync(packageJsonPath)) {
        // Tenta procurar outros arquivos indicadores
        const angularJsonPath = path.join(fullPath, 'angular.json');
        const reactAppPath = path.join(fullPath, 'src', 'index.js');
        const vueConfigPath = path.join(fullPath, 'vue.config.js');
        
        if (existsSync(angularJsonPath)) {
          return `Framework detectado: Angular\n(Caminho: ${projectPath})`;
        }
        if (existsSync(vueConfigPath)) {
          return `Framework detectado: Vue.js\n(Caminho: ${projectPath})`;
        }
        if (existsSync(reactAppPath)) {
          return `Framework detectado: React\n(Caminho: ${projectPath})`;
        }
        
        return `Não foi possível detectar o framework. Arquivo package.json não encontrado em: ${projectPath}`;
      }

      // Lê o package.json
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      
      const dependencies = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      };

      // Detecta frameworks baseado nas dependências
      const frameworkIndicators: { [key: string]: string[] } = {
        'Angular': ['@angular/core', '@angular/common'],
        'React': ['react', 'react-dom'],
        'Vue.js': ['vue', '@vue/cli-service'],
        'Next.js': ['next'],
        'Svelte': ['svelte'],
        'Express': ['express'],
        'NestJS': ['@nestjs/core'],
        'Fastify': ['fastify'],
        'Remix': ['@remix-run/node'],
        'Nuxt.js': ['nuxt']
      };

      const detectedFrameworks: string[] = [];

      for (const [framework, packages] of Object.entries(frameworkIndicators)) {
        if (packages.some(pkg => dependencies[pkg])) {
          detectedFrameworks.push(framework);
        }
      }

      if (detectedFrameworks.length === 0) {
        return `Framework não identificado claramente.\n\nDependências principais encontradas:\n${Object.keys(dependencies).slice(0, 10).join(', ')}\n\nCaminho: ${projectPath}`;
      }

      const frameworkList = detectedFrameworks.join(' + ');
      return `Framework(s) detectado(s): ${frameworkList}\n\nCaminho: ${projectPath}\n\nDependências principais:\n${Object.keys(dependencies).slice(0, 15).join(', ')}`;
    } catch (error: any) {
      return `Erro ao detectar framework: ${error.message}`;
    }
  }
};

// Define as tools (funções) disponíveis para o assistente
export const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: 'Lista os arquivos e diretórios em um diretório. Aceita caminhos relativos ou absolutos (ex: "src" ou "C:\\Users\\...\\projeto").',
      parameters: {
        type: 'object',
        properties: {
          dirPath: {
            type: 'string',
            description: 'Caminho do diretório (relativo ou absoluto). Exemplos: "src", "C:\\Users\\Desktop\\projeto"'
          }
        },
        required: ['dirPath']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Lê o conteúdo completo de um arquivo. Aceita caminhos relativos ou absolutos.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Caminho do arquivo (relativo ou absoluto). Exemplos: "package.json", "C:\\Users\\Desktop\\projeto\\package.json"'
          }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_file',
      description: 'Procura arquivos cujo nome contenha o termo especificado. Aceita caminhos relativos ou absolutos.',
      parameters: {
        type: 'object',
        properties: {
          fileName: {
            type: 'string',
            description: 'Nome ou parte do nome do arquivo a procurar (ex: "main", "server")'
          },
          startDir: {
            type: 'string',
            description: 'Diretório inicial para busca (padrão: diretório atual). Pode ser relativo ou absoluto.',
            default: '.'
          }
        },
        required: ['fileName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'detect_framework',
      description: 'Detecta qual framework/tecnologia um projeto está usando. Analisa package.json e arquivos de configuração. Aceita caminhos absolutos ou relativos.',
      parameters: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Caminho do diretório raiz do projeto (relativo ou absoluto). Exemplo: "C:\\Users\\Desktop\\projeto" ou "."'
          }
        },
        required: ['projectPath']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Cria ou edita um arquivo. Cria o diretório automaticamente se não existir. Aceita caminhos relativos ou absolutos. Use para criar novos arquivos ou modificar arquivos existentes.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Caminho do arquivo a criar/editar (relativo ou absoluto). Exemplos: "src/app.ts", "C:\\Users\\Desktop\\projeto\\main.js"'
          },
          content: {
            type: 'string',
            description: 'Conteúdo completo do arquivo a ser escrito'
          },
          createDirectories: {
            type: 'boolean',
            description: 'Se true, cria os diretórios necessários automaticamente (padrão: true)',
            default: true
          }
        },
        required: ['filePath', 'content']
      }
    }
  }
];

