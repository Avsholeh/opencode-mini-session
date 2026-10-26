import { Plugin } from "@opencode/plugin/tui";
import { registerCommands } from "./commands";
import { parseConfig } from "./config";
import { createHost } from "./host";
import { createMiniSessions } from "./sessions";

export default Plugin.define({
  id: "avsholeh.mini-session",
  setup(context) {
    const config = parseConfig(context.options);
    const host = createHost(context);
    const sessions = createMiniSessions({ host, config });
    registerCommands(context, { sessions, host, config });
  },
});
