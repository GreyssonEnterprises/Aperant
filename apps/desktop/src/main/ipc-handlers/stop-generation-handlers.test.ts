import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));
vi.mock("./utils", () => ({
  safeSendToRenderer: vi.fn(),
}));
vi.mock("../project-store", () => ({
  projectStore: {},
}));

import { IPC_CHANNELS } from "../../shared/constants";
import type { AgentManager } from "../agent";
import { stopIdeationGeneration } from "./ideation/generation-handlers";
import { stopRoadmapGeneration } from "./roadmap-handlers";
import { safeSendToRenderer } from "./utils";

describe("generation stop renderer event ownership", () => {
  const getMainWindow = vi.fn(() => null);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      kind: "ideation",
      stop: async (result: boolean) => stopIdeationGeneration(
        {} as never,
        "project-1",
        { stopIdeation: vi.fn().mockResolvedValue(result) } as unknown as AgentManager,
        null,
      ),
      stoppedChannel: IPC_CHANNELS.IDEATION_STOPPED,
      errorChannel: IPC_CHANNELS.IDEATION_ERROR,
    },
    {
      kind: "roadmap",
      stop: async (result: boolean) => stopRoadmapGeneration(
        "project-1",
        { stopRoadmap: vi.fn().mockResolvedValue(result) } as unknown as AgentManager,
        getMainWindow,
      ),
      stoppedChannel: IPC_CHANNELS.ROADMAP_STOPPED,
      errorChannel: IPC_CHANNELS.ROADMAP_ERROR,
    },
  ])("emits exactly one $kind stopped event on success", async ({
    stop, stoppedChannel, errorChannel,
  }) => {
    await expect(stop(true)).resolves.toEqual({ success: true });
    expect(safeSendToRenderer).toHaveBeenCalledOnce();
    expect(safeSendToRenderer).toHaveBeenCalledWith(
      expect.any(Function), stoppedChannel, "project-1",
    );
    expect(safeSendToRenderer).not.toHaveBeenCalledWith(
      expect.any(Function), errorChannel, expect.anything(), expect.anything(),
    );
  });

  it.each([
    {
      kind: "ideation",
      stop: async (result: boolean) => stopIdeationGeneration(
        {} as never,
        "project-1",
        { stopIdeation: vi.fn().mockResolvedValue(result) } as unknown as AgentManager,
        null,
      ),
      stoppedChannel: IPC_CHANNELS.IDEATION_STOPPED,
      errorChannel: IPC_CHANNELS.IDEATION_ERROR,
    },
    {
      kind: "roadmap",
      stop: async (result: boolean) => stopRoadmapGeneration(
        "project-1",
        { stopRoadmap: vi.fn().mockResolvedValue(result) } as unknown as AgentManager,
        getMainWindow,
      ),
      stoppedChannel: IPC_CHANNELS.ROADMAP_STOPPED,
      errorChannel: IPC_CHANNELS.ROADMAP_ERROR,
    },
  ])("emits exactly one $kind error event on stop failure", async ({
    stop, stoppedChannel, errorChannel,
  }) => {
    await expect(stop(false)).resolves.toEqual({ success: false });
    expect(safeSendToRenderer).toHaveBeenCalledOnce();
    expect(safeSendToRenderer).toHaveBeenCalledWith(
      expect.any(Function), errorChannel, "project-1", expect.any(String),
    );
    expect(safeSendToRenderer).not.toHaveBeenCalledWith(
      expect.any(Function), stoppedChannel, expect.anything(),
    );
  });
});
