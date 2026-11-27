# cc-beautifier

A Claude Code plugin that folds every tool call into a one-line box, so Claude's answers to you are not buried under command output. Click a box's line to open it when you do want to see what a command printed or what a file edit changed.

## What it does

- **Folds each tool call into one line:** `⏺ Bash ▸ git status · 12 sor  [ mind másol ]`. The dot is green when the call worked and red when it failed. The line names the tool, then the command, file or pattern, then how many lines the output has. The labels are Hungarian: `sor` means lines, `mind másol` means copy all.
- **Opens on a click anywhere on that line.** Open, it shows the output in a thin frame under the line, coloured by what it is: a file edit as a coloured diff, a file read or written with syntax highlighting, the output of a shell command that prints a source file (`cat`, `sed`, `grep` and the like) highlighted for that file's language, a long shell command itself above its output, and Claude's subagent and web results as formatted text. Anything else is plain text. You can select all of it with the mouse. The colours are Claude Code's own code highlighting, so they follow your Claude Code theme. Output longer than 400 lines is cut there; the copy button still copies all of it.
- **Copies the whole output** with the `[ mind másol ]` button, so you don't have to select a long output by hand.
- **Folds messages from other agents the same way.** A message from a subagent, a teammate or another session, and a background task's notification, becomes a box too, marked with a `»` in its own colour so it stands apart from tool calls: `» reviewer ▸ Kész a review. · 2 sor  [ mind másol ]`. The line names the sender (`háttérfeladat` for a background task, with how it ended), then the message's first line. Open, it shows the whole message as formatted text in a frame of the same colour. A task that failed has a red `»`.
- **Leaves your prompts and Claude's replies unfolded.** A run of reads and searches that Claude Code already shows as one line (`Read 3 files`) stays as it is too.
- **Marks the conversation itself** with a coloured bar on the left: your prompts in the theme's suggestion colour, Claude's replies in its Claude colour. Tool calls, the boxed messages from other agents and background tasks, and the summaries Claude Code shows of text written between tool calls get no bar, so what you and Claude said to each other stands out.

While a tool call runs, it shows as Claude Code draws it, with its live output; when it finishes, it folds. A box you opened or closed stays that way for the rest of the session.

## Set it up

It is tested with Claude Code 2.1.296. Clicking a box needs Claude Code's fullscreen mode, which reads mouse clicks: set `"tui": "fullscreen"` in `~/.claude/settings.json`. The plugin interface it uses is still early access, so a later Claude Code release may change it.

1. Add this repository as a plugin marketplace in Claude Code: `/plugin marketplace add chekiboy/cc-beautifier`.
2. Install the plugin: `/plugin install cc-beautifier@cc-beautifier`.
3. Start a new session and run `/cc-beautifier`. It prints `fold: on`, `time: off` and `highlight: on`, and the next tool call shows as a folded box once it finishes.

## Settings

| Setting | What it does | Default |
|---|---|---|
| `fold` | Folds each tool call, and each message from another agent or a background task, into a box. | on |
| `highlight` | Marks your prompts and Claude's replies with a coloured bar. | on |
| `time` | Shows the time (hours and minutes) at the start of each of your prompts, Claude's replies and tool calls, so you can see when they happened. | off |

Switch one with `/cc-beautifier <setting> on|off`, for example `/cc-beautifier time on`, or in `/config` (the **Fold tool messages**, **Show message time** and **Highlight conversation** rows). `/cc-beautifier` alone shows how each is set. The choice is saved in `~/.claude/settings.json` and kept for later sessions.

A dim line with the date (`──── 2026-10-13 ────`) appears above the first message of each new day, and above the first message after you turn `time` on. The plugin notes each time as the message arrives, so messages from before you turned `time` on, and from before the session loaded the plugin, show no time.

## Develop it

To change the plugin, run it from a clone instead of the installed copy, and use only one of the two:

1. Clone this repository.
2. Make a folder for your Claude Code plugins, for example `~/plugins`, and put a link to the clone in it: `ln -s <the folder you cloned> ~/plugins/cc-beautifier`.
3. In `~/.claude/settings.json`, add the folder to the `env` section (create the section if it is missing): `"env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/plugins" }`. Every session then loads each plugin in that folder. Set it in this file, not in a project's settings: the value here replaces one set in your shell.
4. After an edit, run `/reload-plugins` in a running session.

To try the clone in a single session instead of steps 2–3, start Claude Code with `claude --plugin-dir <the folder you cloned>`.

Run the tests with `claude plugin test .` and check the plugin with `claude plugin validate .`. The box's line is drawn by `hooks/header.tsx`; everything else is in `hooks/register.tsx`.

## License

Apache License 2.0, see [LICENSE](LICENSE).
