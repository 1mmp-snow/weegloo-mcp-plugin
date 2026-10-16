# Weegloo Plugin

Connects AI coding agents — **Claude Code, Codex, Cursor, Antigravity and Android Studio** — to [Weegloo](https://weegloo.com). It installs the Weegloo **MCP server**, so the agent can view, create, update and delete Weegloo resources and perform nearly everything the console can, in natural language, plus the **skills and rules** that teach the agent how to build on Weegloo correctly.

## Features

The Weegloo MCP server provides the following capabilities:

- **Entity**: Supports create, read, update, and delete (CRUD) operations for all entities, including Organization, Space, ContentType, Content, and Media.
- **WebHosting**: You can deploy web projects and host them on the web.

## Installation

> **AI agent?** If a user gave you this README and asked you to install Weegloo, follow steps 1–5 in order. Run the commands yourself. Stop and ask the user only where a step says so.

### 1. Check Node.js

```bash
node --version
```

**Node.js 18.3 or newer** is required (an active LTS release is recommended). If `node` is missing or older, ask the user to install the LTS release from <https://nodejs.org>, then continue.

Nothing else needs to be installed beforehand. `npx` comes with Node.js, and the installer fetches everything else.

### 2. Choose the options

**`--agent` (required): the agent that will use Weegloo.** If you are an AI agent installing for yourself, this is you.

| Agent | `--agent` |
|---|---|
| Claude Code (CLI, desktop app, IDE extensions) | `claude` |
| Codex (CLI, IDE extension) | `codex` |
| Cursor | `cursor` |
| Antigravity | `antigravity` |
| Android Studio (Gemini) | `androidstudio` |

**`--location`: where to install.**

| Value | Installs into | Use when |
|---|---|---|
| `global` (default) | the user's home directory, for every project | the user did not ask for anything else |
| `project` | the current directory only | the user asked for this project only — run the command from the project root |

Android Studio is always installed into the current project. Run its command from the project root.

**Xcode only: `--host xcode`.** If the user wants to use you (Claude Code or Codex) inside Xcode, add `--host xcode` and run the command from the Xcode project root. Xcode installs are always project-scoped; the installer sets `--location project` by itself.

**Android Studio only: a Personal Access Token.** Android Studio's MCP server authenticates with a Weegloo Personal Access Token instead of a browser sign-in. Ask the user to create one at <https://console.weegloo.com/personal-access-token/connect?tool=weegloo-mcp> and pass it with `--token`. No other agent needs a token.

### 3. Run the installer

```bash
npx --yes weegloo@latest --yes --agent <agent> --location global
```

- The first `--yes` belongs to `npx`: it downloads the installer without asking. The second `--yes` belongs to the installer: it runs **non-interactively** and installs the MCP server and all skills and rules, prompting for nothing.
- Without the second `--yes`, the installer still runs non-interactively when there is no terminal to prompt on (an agent's shell, CI). Pass it anyway, so it never waits for input.
- Success ends with **`Installation complete!`**. A missing or invalid option stops the installer with a message naming it. Fix the option and run the same command again; re-running is safe.

Examples:

```bash
# Claude Code, for every project
npx --yes weegloo@latest --yes --agent claude --location global

# Codex, this project only
npx --yes weegloo@latest --yes --agent codex --location project

# Cursor
npx --yes weegloo@latest --yes --agent cursor

# Antigravity
npx --yes weegloo@latest --yes --agent antigravity

# Android Studio (from the project root, with the user's Personal Access Token)
npx --yes weegloo@latest --yes --agent androidstudio --token <personal-access-token>

# Claude Code inside Xcode (from the Xcode project root; use --agent codex for Codex)
npx --yes weegloo@latest --yes --agent claude --host xcode
```

### 4. Restart the agent and sign in in the browser

The agent loads MCP servers, skills and rules only when it starts, so **restart it, or open a new session**, first. Then sign in to the `weegloo` MCP server with the user's Weegloo account. The sign-in completes in a browser, so the user has to finish it. If you are an AI agent, tell the user exactly what to do:

| Agent | Sign in |
|---|---|
| Claude Code | In a new session run `/mcp`, select **`weegloo`** → **Authenticate**, and sign in in the browser that opens. |
| Codex | Run `codex mcp login weegloo` in a terminal and sign in in the browser that opens. |
| Cursor | Click **Customize** at the top left → **MCPs** → `weegloo`, turn on the **User** toggle, click **Authenticate**, and sign in in the browser that opens. |
| Antigravity | Run `agy`, enter `/mcp`, select `weegloo` → **Authenticate**, and sign in in the browser that opens. Then paste the **Code** shown in the browser back into Antigravity and press Enter. |
| Android Studio | Nothing to do. The token from step 2 is already configured. |
| Claude Code / Codex inside Xcode | Same as Claude Code / Codex above, but start the terminal session in the Xcode project folder. |

The second server, `weegloo-upload`, needs no sign-in. It gets its upload token through `weegloo`.

### 5. Check that it works

After the restart and sign-in, ask the agent something like *"Show my Weegloo account information."* It should answer using the `weegloo` MCP tools. On its first Weegloo request, the agent may ask the user to review and accept the latest Weegloo terms of service (<https://weegloo.com/terms>). That is expected.

### Installer options

| Option | Meaning |
|---|---|
| `-a, --agent <id>` | `claude` \| `codex` \| `cursor` \| `antigravity` \| `androidstudio`. Required with `--yes`. |
| `-l, --location <loc>` | `global` (default) \| `project`. |
| `-y, --yes` | Non-interactive: use the defaults for anything not given. |
| `-t, --token <pat>` | Personal Access Token, **Android Studio only**. Also read from `WEEGLOO_TOKEN`. |
| `--mcp <group>` | MCP tool group: `default` (default) \| `core` \| `all` (see [MCP server groups](#mcp-server-groups)). |
| `--no-mcp` | Install only the skills and rules, not the MCP server. |
| `--ignore-skill` / `--ignore-rule` | Do not install the skills / the rules. |
| `--country <cc>` | Country code (e.g. `KR`, `US`) that decides which country-specific skills install. Detected from the network by default; pass it if the user is on a VPN or abroad. |
| `--host xcode` | Claude Code or Codex running inside Xcode: lets Xcode find `npx` for `weegloo-upload`. |
| `-b, --branch <ref>` | Install from another branch or tag (default: `latest`). |
| `-h, --help` | Show every option. |

Run `npx weegloo@latest` with no options for the interactive installer, which asks for each choice. The full reference, including where each agent's files go, is in [installer-cli/README.md](installer-cli/README.md).

### Update and uninstall

```bash
# Update the installed skills and rules (keeps the user's selection; no sign-in needed)
npx weegloo@latest --agent claude --location global --update

# Remove everything the installer added
npx weegloo@latest --yes --agent claude --location global --uninstall
```

Use the same `--agent` and `--location` the install used. The installed `weegloo-version` rule tells the agent when an update is available.

### Agents the installer does not support

Register the two MCP servers by hand in that agent's MCP configuration and sign in to `weegloo` in the browser when the agent asks. The skills and rules are not installed this way.

```json
{
  "mcpServers": {
    "weegloo": {
      "type": "http",
      "url": "https://ai.weegloo.com/mcp"
    },
    "weegloo-upload": {
      "command": "npx",
      "args": ["-y", "weegloo-upload"],
      "env": {
        "UPLOAD_API_URL": "https://upload.weegloo.com/v1"
      }
    }
  }
}
```

## MCP server groups

The MCP server tool groups are as follows:

| Group | Description | URL |
|----------|----------|-----|
| {none}  | Includes the basic set of tools: everything in `core`, plus Script, Webhook, Scheduler, WebHosting, ServiceLogin, ServiceUserRole, access tokens, and EmailAccount. | https://ai.weegloo.com/mcp |
| core  | Content, ContentType, Media, Locale, and Organization / Space / membership / role tools only. | https://ai.weegloo.com/mcp?group=core |
| all | Includes all available tools: the basic set plus Comment and Tag. If you register the MCP server for this group, the other groups are not required. | https://ai.weegloo.com/mcp?group=all |

## Repository layout

**One plugin bundle** (`plugins/weegloo/`) holds `skills/`, `rules/` and the MCP configuration. The installer reads `plugins/weegloo/installer-manifest.json`, which is built from that bundle.

## Documentation & Resources

- [Official Weegloo MCP Server Documentation](https://docs.weegloo.com/en-US/ai/tools/mcp/)
- [Installer reference](installer-cli/README.md)

## Questions or Issues?

For questions about the Weegloo MCP server or integration issues, please refer to the [official Weegloo documentation](https://docs.weegloo.com/en-US/ai/tools/mcp/).
