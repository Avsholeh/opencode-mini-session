import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { registerCommands } from "./commands";
import { parseConfig } from "./config";
import { createHost } from "./host";
import { createMiniSessions } from "./sessions";

const tui: TuiPlugin = async (api, options) => {
  const config = parseConfig(options);
  const host = createHost(api);
  const sessions = createMiniSessions({ host, config });
  registerCommands(api, { sessions, host, config });
};

const plugin: TuiPluginModule & { id: string } = {
  id: "avsholeh.mini-session",
  tui,
};

export default plugin;
