/**
 * Ideation generation handlers (start/stop generation)
 */

import type { IpcMainEvent, IpcMainInvokeEvent, BrowserWindow } from "electron";
import {
  IPC_CHANNELS,
} from "../../../shared/constants";
import type {
  IPCResult,
  IdeationConfig,
  IdeationGenerationStatus,
} from "../../../shared/types";
import { projectStore } from "../../project-store";
import type { AgentManager } from "../../agent";
import { debugLog } from "../../../shared/utils/debug-logger";
import { safeSendToRenderer } from "../utils";
import { getActiveProviderFeatureSettings } from "../feature-settings-helper";

/**
 * Read ideation feature settings using per-provider resolution
 */
function getIdeationFeatureSettings(): { model?: string; thinkingLevel?: string } {
  return getActiveProviderFeatureSettings('ideation');
}

/**
 * Start ideation generation for a project
 */
export async function startIdeationGeneration(
  _event: IpcMainEvent,
  projectId: string,
  config: IdeationConfig,
  agentManager: AgentManager,
  mainWindow: BrowserWindow | null
): Promise<void> {
  // Get feature settings and merge with config
  const featureSettings = getIdeationFeatureSettings();
  const configWithSettings: IdeationConfig = {
    ...config,
    model: config.model || featureSettings.model,
    thinkingLevel: config.thinkingLevel || featureSettings.thinkingLevel,
  };

  debugLog("[Ideation Handler] Start generation request:", {
    projectId,
    enabledTypes: configWithSettings.enabledTypes,
    maxIdeasPerType: configWithSettings.maxIdeasPerType,
    model: configWithSettings.model,
    thinkingLevel: configWithSettings.thinkingLevel,
  });

  const getMainWindow = () => mainWindow;

  const project = projectStore.getProject(projectId);
  if (!project) {
    debugLog("[Ideation Handler] Project not found:", projectId);
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.IDEATION_ERROR, projectId, "Project not found");
    return;
  }

  debugLog("[Ideation Handler] Starting agent manager generation:", {
    projectId,
    projectPath: project.path,
    model: configWithSettings.model,
    thinkingLevel: configWithSettings.thinkingLevel,
  });

  // ipcMain.on doesn't observe returned promises, so settle failures here.
  void agentManager.startIdeationGeneration(
    projectId, project.path, configWithSettings, false,
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Ideation generation could not start";
    debugLog("[Ideation Handler] Generation start failed:", { projectId, message });
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.IDEATION_ERROR, projectId, message);
  });

  // Send initial progress
  safeSendToRenderer(getMainWindow, IPC_CHANNELS.IDEATION_PROGRESS, projectId, {
    phase: "analyzing",
    progress: 10,
    message: "Analyzing project structure...",
  } as IdeationGenerationStatus);
}

/**
 * Refresh ideation session (regenerate with new ideas)
 */
export async function refreshIdeationSession(
  _event: IpcMainEvent,
  projectId: string,
  config: IdeationConfig,
  agentManager: AgentManager,
  mainWindow: BrowserWindow | null
): Promise<void> {
  // Get feature settings and merge with config
  const featureSettings = getIdeationFeatureSettings();
  const configWithSettings: IdeationConfig = {
    ...config,
    model: config.model || featureSettings.model,
    thinkingLevel: config.thinkingLevel || featureSettings.thinkingLevel,
  };

  debugLog("[Ideation Handler] Refresh session request:", {
    projectId,
    model: configWithSettings.model,
    thinkingLevel: configWithSettings.thinkingLevel,
  });

  const getMainWindow = () => mainWindow;

  const project = projectStore.getProject(projectId);
  if (!project) {
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.IDEATION_ERROR, projectId, "Project not found");
    return;
  }

  // ipcMain.on doesn't observe returned promises, so settle failures here.
  void agentManager.startIdeationGeneration(
    projectId, project.path, configWithSettings, true,
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Ideation refresh could not start";
    debugLog("[Ideation Handler] Refresh start failed:", { projectId, message });
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.IDEATION_ERROR, projectId, message);
  });

  // Send initial progress
  safeSendToRenderer(getMainWindow, IPC_CHANNELS.IDEATION_PROGRESS, projectId, {
    phase: "analyzing",
    progress: 10,
    message: "Refreshing ideation...",
  } as IdeationGenerationStatus);
}

/**
 * Stop ideation generation
 */
export async function stopIdeationGeneration(
  _event: IpcMainInvokeEvent,
  projectId: string,
  agentManager: AgentManager,
  mainWindow: BrowserWindow | null
): Promise<IPCResult> {
  debugLog("[Ideation Handler] Stop generation request:", { projectId });

  const wasStopped = await agentManager.stopIdeation(projectId);

  debugLog("[Ideation Handler] Stop result:", { projectId, wasStopped });

  if (wasStopped) {
    debugLog("[Ideation Handler] Sending stopped event to renderer");
    const getMainWindow = () => mainWindow;
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.IDEATION_STOPPED, projectId);
  }

  return { success: wasStopped };
}
