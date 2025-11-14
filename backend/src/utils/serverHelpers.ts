import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

/**
 * Utilitários para gerenciamento do servidor
 */

/**
 * Verifica se o servidor está rodando sob nodemon
 * 
 * @returns {boolean} True se estiver rodando sob nodemon
 */
export function isRunningUnderNodemon(): boolean {
  return !!process.env.NODEMON || 
         process.env.npm_lifecycle_event === 'dev' || 
         process.argv.some(arg => arg.includes('nodemon'));
}

/**
 * Configuração de timeout para shutdown baseado no ambiente
 */
export interface ShutdownConfig {
  /** Timeout total para shutdown */
  shutdownTimeout: number;
  /** Delay para liberar a porta */
  portReleaseDelay: number;
}

/**
 * Obtém configuração de shutdown baseada no ambiente
 * 
 * @param {boolean} isNodemon - Se está rodando sob nodemon
 * @returns {ShutdownConfig} Configuração de shutdown
 */
export function getShutdownConfig(isNodemon: boolean): ShutdownConfig {
  return {
    shutdownTimeout: isNodemon ? 3000 : 5000,
    portReleaseDelay: isNodemon ? 200 : 500
  };
}

/**
 * Realiza shutdown graceful do servidor
 * 
 * @param {HTTPServer} httpServer - Servidor HTTP
 * @param {SocketIOServer} io - Servidor Socket.IO
 * @param {ShutdownConfig} config - Configuração de shutdown
 * @returns {Promise<void>} Promise que resolve quando o shutdown for concluído
 */
export function gracefulShutdown(
  httpServer: HTTPServer,
  io: SocketIOServer,
  config: ShutdownConfig
): Promise<void> {
  return new Promise((resolve) => {
    let shutdownComplete = false;

    // Fecha todas as conexões ativas primeiro
    if (httpServer.listening) {
      httpServer.closeAllConnections();
      console.log('📡 Conexões HTTP fechadas.');
    }

    // Fecha todas as conexões do Socket.IO
    io.disconnectSockets(true);
    console.log('🔌 Conexões Socket.IO desconectadas.');

    // Fecha o Socket.IO
    io.close(() => {
      console.log('✅ Socket.IO fechado.');
    });

    // Fecha o servidor HTTP
    if (httpServer.listening) {
      httpServer.close(() => {
        console.log('✅ Servidor HTTP fechado.');

        // Aguarda um pouco para garantir que a porta seja liberada
        setTimeout(() => {
          if (!shutdownComplete) {
            shutdownComplete = true;
            console.log('🚪 Porta liberada. Encerrando processo...');
            resolve();
          }
        }, config.portReleaseDelay);
      });
    } else {
      // Se não estava escutando, apenas espera e resolve
      setTimeout(() => {
        if (!shutdownComplete) {
          shutdownComplete = true;
          console.log('🚪 Encerrando processo...');
          resolve();
        }
      }, config.portReleaseDelay);
    }

    // Força o fechamento após timeout se não fechar normalmente
    setTimeout(() => {
      if (!shutdownComplete) {
        shutdownComplete = true;
        console.error('⚠️ Forçando fechamento do servidor (timeout)...');
        resolve();
      }
    }, config.shutdownTimeout);
  });
}

