/**
 * Serviço de monitoramento de conexões
 */

import { Server } from 'socket.io';
import { Socket } from 'socket.io';
import { getMonitorsForTarget, addMonitor, removeMonitor } from './connectionService';
import { getConnection } from './connectionService';

let ioInstance: Server | null = null;

/**
 * Inicializa o serviço de monitoramento com a instância do Socket.IO
 */
export function initializeMonitoring(io: Server): void {
  ioInstance = io;
}

/**
 * Emite evento para todos os monitores de um socket alvo
 */
export function emitToMonitors(targetSocketId: string, event: string, data: any): void {
  if (!ioInstance) {
    console.warn('⚠️ Socket.IO não inicializado para monitoramento');
    return;
  }

  const monitors = getMonitorsForTarget(targetSocketId);
  let emittedCount = 0;

  monitors.forEach(monitorSocketId => {
    const monitorSocket = ioInstance!.sockets.sockets.get(monitorSocketId);
    if (monitorSocket) {
      monitorSocket.emit('monitored_event', {
        targetSocketId,
        event,
        data,
        timestamp: new Date().toISOString()
      });
      emittedCount++;
    }
  });

  if (emittedCount === 0 && monitors.length > 0) {
    console.log(`⚠️ Evento '${event}' não foi emitido para nenhum monitor (target: ${targetSocketId}, monitores ativos: ${monitors.length})`);
  }
}

/**
 * Inicia monitoramento de uma conexão
 */
export function startMonitoring(monitorSocket: Socket, targetSocketId: string): { success: boolean; error?: string } {
  if (!ioInstance) {
    return { success: false, error: 'Socket.IO não inicializado' };
  }

  const targetSocket = ioInstance.sockets.sockets.get(targetSocketId);
  if (!targetSocket) {
    return { success: false, error: 'Conexão alvo não encontrada' };
  }

  addMonitor(monitorSocket.id, targetSocketId);
  
  monitorSocket.emit('monitoring_started', {
    targetSocketId,
    message: 'Monitoramento iniciado'
  });

  // Envia informações da conexão atual
  const connInfo = getConnection(targetSocketId);
  if (connInfo) {
    monitorSocket.emit('monitored_event', {
      targetSocketId,
      event: 'connection_info',
      data: {
        socketId: connInfo.socketId,
        threadId: connInfo.threadId,
        connectedAt: connInfo.connectedAt.toISOString(),
        lastActivity: connInfo.lastActivity.toISOString(),
        messageCount: connInfo.messageCount,
        userAgent: connInfo.userAgent,
        ipAddress: connInfo.ipAddress
      },
      timestamp: new Date().toISOString()
    });
  }

  return { success: true };
}

/**
 * Para monitoramento de uma conexão
 */
export function stopMonitoring(monitorSocket: Socket): void {
  removeMonitor(monitorSocket.id);
  monitorSocket.emit('monitoring_stopped', {
    message: 'Monitoramento parado'
  });
}

/**
 * Remove monitores de um socket que foi desconectado
 */
export function cleanupMonitorsForDisconnectedSocket(disconnectedSocketId: string): void {
  if (!ioInstance) {
    return;
  }

  const monitors = getMonitorsForTarget(disconnectedSocketId);
  monitors.forEach(monitorId => {
    const monitorSocket = ioInstance!.sockets.sockets.get(monitorId);
    if (monitorSocket) {
      monitorSocket.emit('monitored_event', {
        targetSocketId: disconnectedSocketId,
        event: 'disconnect',
        data: { socketId: disconnectedSocketId },
        timestamp: new Date().toISOString()
      });
    }
    removeMonitor(monitorId);
  });
}

