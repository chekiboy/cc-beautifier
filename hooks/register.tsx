import { atom, memberOf, read, update } from 'claude-code'
import type { Color, EngineInterface, Register, RenderElement, RenderInput, UiPressArgument } from 'claude-code'

import { toneColor } from './header'
import type { HeaderProps } from './header'

const isOpen = atom({ plugin: 'cc-beautifier', key: 'isOpen' } as const, null)
const times = atom({ plugin: 'cc-beautifier', key: 'times' } as const, 0)
const dayStarts = atom({ plugin: 'cc-beautifier', key: 'dayStarts' } as const, '')
const lastDay = atom({ plugin: 'cc-beautifier', key: 'lastDay' } as const, '')

const SWITCHES = ['fold', 'time', 'highlight'] as const

function clockTime(ms: number): string {
  const d = new Date(ms)

  return [d.getHours(), d.getMinutes()].map(n => String(n).padStart(2, '0')).join(':')
}

function dayOf(ms: number): string {
  const d = new Date(ms)

  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-')
}

async function stamp($: EngineInterface, id: string): Promise<void> {
  const row = { requestId: id }
  if (await read($, memberOf(times, row))) {
    return
  }
  const now = await $.clock.now()
  await update($, memberOf(times, row), at => at || now)
  const day = dayOf(now)
  let isNewDay = false
  await update($, lastDay, last => {
    isNewDay = last !== day
    return day
  })
  if (isNewDay) {
    await update($, memberOf(dayStarts, row), () => day)
  }
}

async function timeOf($: EngineInterface, e: Pick<RenderInput, 'requestId'>): Promise<string | undefined> {
  const at = await read($, memberOf(times, e))

  return at ? clockTime(at) : undefined
}

async function underDay($: EngineInterface, e: RenderInput, row: RenderElement): Promise<RenderElement> {
  const day = await read($, memberOf(dayStarts, e))
  if (!day) {
    return row
  }
  const { Box, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="column">
      <Box marginTop={1}>
        <Text dimColor>──── {day} ────</Text>
      </Box>
      {row}
    </Box>
  )
}

function lineCount(text: string): number {
  return text === '' ? 0 : text.split('\n').length
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? ''
}

function outputText(output: unknown): string {
  if (typeof output === 'string') {
    return output
  }
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    if (typeof o.stdout === 'string' || typeof o.stderr === 'string') {
      return [o.stdout, o.stderr].filter(s => typeof s === 'string' && s !== '').join('\n')
    }
    const file = o.file as Record<string, unknown> | undefined
    if (file && typeof file.content === 'string') {
      return file.content
    }
    if (Array.isArray(o.content)) {
      return o.content
        .map(b => (b && typeof b === 'object' && typeof (b as Record<string, unknown>).text === 'string' ? (b as { text: string }).text : ''))
        .filter(t => t !== '')
        .join('\n')
    }
    for (const field of ['content', 'text', 'result', 'output']) {
      if (typeof o[field] === 'string') {
        return o[field] as string
      }
    }
  }

  return JSON.stringify(output, null, 2) ?? ''
}

const MAX_LINES = 400

type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

function unifiedDiff(output: unknown): string | undefined {
  const patch = output && typeof output === 'object' ? (output as { structuredPatch?: unknown }).structuredPatch : undefined
  if (!Array.isArray(patch) || patch.length === 0) {
    return undefined
  }

  return (patch as Hunk[])
    .map(h => [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines].join('\n'))
    .join('\n')
}

function filePath(output: unknown, input: unknown): string | undefined {
  for (const o of [output, (output as { file?: unknown } | undefined)?.file, input]) {
    if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>
      const path = r.filePath ?? r.file_path
      if (typeof path === 'string') {
        return path
      }
    }
  }

  return undefined
}

const MARKDOWN_TOOLS = new Set(['Agent', 'Task', 'WebFetch', 'WebSearch'])

const PRINTS_CODE = /(?:^|[\s;&|(])(?:cat|head|tail|nl|bat|less|sed|grep|rg|awk)\s/

const CODE_FILE = /[\w./~-]+\.(php|phtml|py|ts|tsx|js|jsx|mjs|cjs|json|ya?ml|toml|sh|bash|zsh|go|rb|java|kt|rs|c|h|cpp|hpp|cs|sql|html|css|scss|vue|xml|twig|blade\.php|md)\b/g

function printedFile(command: string): string | undefined {
  if (!PRINTS_CODE.test(command)) {
    return undefined
  }
  const files = [...command.matchAll(CODE_FILE)]
  const kinds = new Set(files.map(match => match[1]))

  return kinds.size === 1 ? files.at(-1)?.[0] : undefined
}

function startLineOf(output: unknown): number | undefined {
  const file = output && typeof output === 'object' ? (output as { file?: { startLine?: unknown } }).file : undefined

  return typeof file?.startLine === 'number' ? file.startLine : undefined
}

function commandOf(input: unknown): string | undefined {
  const command = input && typeof input === 'object' ? (input as { command?: unknown }).command : undefined

  return typeof command === 'string' ? command : undefined
}

function cap(text: string): { shown: string; hidden: number } {
  const lines = text.split('\n')

  return lines.length <= MAX_LINES
    ? { shown: text, hidden: 0 }
    : { shown: lines.slice(0, MAX_LINES).join('\n'), hidden: lines.length - MAX_LINES }
}

function inputSummary(input: unknown): string {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>
    for (const field of ['command', 'file_path', 'pattern', 'path', 'url', 'query', 'description', 'prompt', 'skill']) {
      if (typeof o[field] === 'string' && o[field] !== '') {
        const one = firstLine(o[field] as string)
        return one.length > 80 ? `${one.slice(0, 79)}…` : one
      }
    }
  }

  return ''
}

async function besideTime(
  $: EngineInterface,
  e: RenderInput,
  drawEngine: () => Promise<RenderElement>,
): Promise<RenderElement> {
  const time = await timeOf($, e)
  if (time === undefined) {
    return drawEngine()
  }
  const { Box, Text } = $.ui.resolve(e)
  const drawn = await drawEngine()

  return underDay(
    $,
    e,
    <Box flexDirection="row">
      <Box flexShrink={0} marginRight={1} marginTop={1}>
        <Text dimColor>{time}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        {drawn}
      </Box>
    </Box>,
  )
}

const OWN_ORIGINS = new Set(['composer', 'bridge'])

const BAR = '┃\n'.repeat(1000)

function isOwnPrompt(props: RenderInput<'UserMessage'>['props']): boolean {
  return OWN_ORIGINS.has(props.origin.kind) && props.task === undefined && props.from === undefined
}

async function barred(
  $: EngineInterface,
  e: RenderInput,
  color: Color,
  drawEngine: () => Promise<RenderElement>,
): Promise<RenderElement> {
  const { Box, Text } = $.ui.resolve(e)
  const drawn = await drawEngine()

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {drawn}
      <Box key="bar" position="absolute" top={1} bottom={0} left={0} width={1} overflow="hidden">
        <Text color={color}>{BAR}</Text>
      </Box>
    </Box>
  )
}

async function copyAll($: EngineInterface, text: string, press: UiPressArgument): Promise<void> {
  const copied = await $.ui.copy({ text, surface: press.surface })
  void $.ui.toast(copied.isCopied ? `Vágólapra másolva (${lineCount(text)} sor)` : `Másolás sikertelen: ${copied.reason}`)
}

async function headerRow(
  $: EngineInterface,
  e: RenderInput,
  head: HeaderProps,
  text: string,
  isTiming: boolean,
): Promise<RenderElement> {
  let title: RenderElement
  if (e.surface === 'terminal' || e.surface === 'desktop') {
    const { Client } = $.ui.resolve(e)
    title = <Client key={`head-${e.requestId}`} module="./header.tsx" props={head} />
  } else {
    const { Text, Button } = $.ui.resolve(e)
    const toggle = () => update($, memberOf(isOpen, e), () => !head.isExpanded)
    title = (
      <Button key="toggle" plain onPress={toggle}>
        <Text color={toneColor(head.tone)}>{head.mark ?? '⏺'}</Text> <Text bold>{head.tool}</Text>{' '}
        {head.isExpanded ? '▾' : '▸'} <Text dimColor>{`${head.summary} · ${head.status}`}</Text>
      </Button>
    )
  }
  const { Box, Button, Text } = $.ui.resolve(e)
  const time = isTiming ? await timeOf($, e) : undefined

  return (
    <Box flexDirection="row" gap={1} marginLeft={time === undefined ? 1 : 0}>
      {time !== undefined && (
        <Box flexShrink={0}>
          <Text dimColor>{time}</Text>
        </Box>
      )}
      {title}
      {text !== '' && <Button key="copy" label="mind másol" dimColor onPress={press => copyAll($, text, press)} />}
    </Box>
  )
}

const MESSAGE_ORIGINS = new Set(['task-notification', 'peer', 'peer-send-message', 'coordinator'])

function isFromOthers(props: RenderInput<'UserMessage'>['props']): boolean {
  return props.from !== undefined || props.task !== undefined || MESSAGE_ORIGINS.has(props.origin.kind)
}

function senderOf(props: RenderInput<'UserMessage'>['props']): string {
  if (props.from !== undefined) {
    return props.from.name
  }

  return props.task !== undefined ? 'háttérfeladat' : 'üzenet'
}

async function messageBox($: EngineInterface, e: RenderInput<'UserMessage'>, isTiming: boolean): Promise<RenderElement> {
  const isExpanded = (await read($, memberOf(isOpen, e))) ?? false
  const text = e.props.text
  const summary = firstLine(text)
  const status = [e.props.task?.status, `${lineCount(text)} sor`].filter(Boolean).join(' · ')
  const head: HeaderProps = {
    tool: senderOf(e.props),
    summary: summary.length > 80 ? `${summary.slice(0, 79)}…` : summary,
    status,
    tone: e.props.task?.status === 'failed' ? 'error' : 'agent',
    isExpanded,
    mark: '»',
  }
  const header = await headerRow($, e, head, text, isTiming)
  const { Box, Markdown, Text } = $.ui.resolve(e)
  const { shown, hidden } = cap(text)
  const box = !isExpanded ? (
    header
  ) : (
    <Box flexDirection="column">
      {header}
      {shown !== '' && (
        <Box marginLeft={5} paddingX={1} flexDirection="column" borderStyle="round" borderColor="permission">
          <Markdown text={shown} />
          {hidden > 0 && <Text dimColor>… +{hidden} sor (a teljes szöveg: mind másol)</Text>}
        </Box>
      )}
    </Box>
  )

  return isTiming ? underDay($, e, <Box marginTop={1}>{box}</Box>) : <Box marginTop={1}>{box}</Box>
}

export const register: Register = (on, options) => {
  const isFolding = options.fold !== false
  const isTiming = options.time === true
  const isHighlighting = options.highlight !== false
  const state = { fold: isFolding, time: isTiming, highlight: isHighlighting }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cc-beautifier',
      description: 'Turn tool-call folding, message times or conversation highlighting on or off',
      argumentHint: 'fold|time|highlight on|off',
    })

    return next(e)
  })

  on('command.run', { command: 'cc-beautifier' }, async ($, e) => {
    const [field, value] = e.args.trim().split(/\s+/)
    const toggle = SWITCHES.find(name => name === field)
    if (toggle === undefined || (value !== 'on' && value !== 'off')) {
      return {
        text: [
          ...SWITCHES.map(name => `${name}: ${state[name] ? 'on' : 'off'}`),
          'Használat: /cc-beautifier fold|time|highlight on|off',
        ].join('\n'),
      }
    }
    const set = await $.config.set({ key: `cc-beautifier.${toggle}`, value: value === 'on' })

    return { text: set.deny ? `Nem sikerült: ${set.deny}` : `${field}: ${value}` }
  })

  if (isTiming) {
    on('session.append', async ($, e, next) => {
      if ((e.door === 'prompt' || e.door === 'response') && e.message.role !== undefined) {
        try {
          await stamp($, e.uuid)
        } catch {
          // a missing time only leaves the row without one
        }
      }

      return next(e)
    }).catch(($, e, next) => next(e))

    on('tool.call', async ($, e, next) => {
      try {
        await stamp($, e.tool_use_id)
      } catch {
        // a missing time only leaves the row without one
      }

      return next(e)
    }).catch(($, e, next) => next(e))
  }

  if (isTiming || isHighlighting || isFolding) {
    on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
      if (isFolding && isFromOthers(e.props)) {
        return messageBox($, e, isTiming)
      }
      const draw =
        isHighlighting && isOwnPrompt(e.props) ? () => barred($, e, 'suggestion', () => next(e)) : () => next(e)
      return isTiming ? besideTime($, e, draw) : draw()
    })
  }

  if (isTiming || isHighlighting) {
    on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
      const draw = isHighlighting && !e.props.isSummary ? () => barred($, e, 'claude', () => next(e)) : () => next(e)
      return isTiming ? besideTime($, e, draw) : draw()
    })
  }

  if (!isFolding) {
    if (isTiming) {
      on('ui.render', { component: 'ToolUse' }, ($, e, next) => besideTime($, e, () => next(e)))
    }

    return
  }

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const open = memberOf(isOpen, e)
    const choice = await read($, open)
    if (choice === null && e.props.isRunning) {
      return isTiming ? besideTime($, e, () => next(e)) : next(e)
    }
    const isExpanded = choice ?? false
    const diff = unifiedDiff(e.props.output)
    const text = diff ?? (e.props.output === undefined ? '' : outputText(e.props.output))
    const head: HeaderProps = {
      tool: e.props.tool,
      summary: inputSummary(e.props.input),
      status: e.props.isRunning ? 'fut…' : e.props.isInterrupted ? 'megszakítva' : `${lineCount(text)} sor`,
      tone: e.props.isErrored ? 'error' : e.props.isRunning ? 'running' : 'success',
      isExpanded,
    }
    const header = await headerRow($, e, head, text, isTiming)
    if (!isExpanded) {
      return isTiming ? underDay($, e, header) : header
    }
    const { Box, Text, Code, Markdown } = $.ui.resolve(e)
    const { shown, hidden } = cap(text)
    const command = e.props.tool === 'Bash' ? commandOf(e.props.input) : undefined
    const isLongCommand = command !== undefined && (command.includes('\n') || command.length > 80)
    const codePath = e.props.isErrored
      ? undefined
      : command !== undefined
        ? printedFile(command)
        : e.props.tool === 'Read' || e.props.tool === 'Write'
          ? filePath(e.props.output, e.props.input)
          : undefined
    const body =
      diff !== undefined ? (
        <Code source={shown} format="diff" path={filePath(e.props.output, e.props.input)} />
      ) : codePath !== undefined ? (
        <Code source={shown} path={codePath} startLine={startLineOf(e.props.output)} />
      ) : MARKDOWN_TOOLS.has(e.props.tool) && !e.props.isErrored ? (
        <Markdown text={shown} />
      ) : (
        <Text color={e.props.isErrored ? 'error' : undefined}>{shown}</Text>
      )

    const box = (
      <Box flexDirection="column">
        {header}
        {(shown !== '' || isLongCommand) && (
          <Box marginLeft={5} paddingX={1} flexDirection="column" borderStyle="round" borderDimColor>
            {isLongCommand && command !== undefined && <Code source={command} language="bash" />}
            {isLongCommand && shown !== '' && <Text dimColor>──</Text>}
            {shown !== '' && body}
            {hidden > 0 && <Text dimColor>… +{hidden} sor (a teljes szöveg: mind másol)</Text>}
          </Box>
        )}
      </Box>
    )

    return isTiming ? underDay($, e, box) : box
  })

  for (const component of ['ToolUse', 'UserMessage'] as const) {
    on('ui.message', { component, module: 'hooks/header.tsx' }, async ($, e, next) => {
      if (e.element === `head-${e.requestId}`) {
        const shown = (e.data as { isExpanded?: unknown } | null)?.isExpanded === true
        await update($, memberOf(isOpen, e), () => !shown)
      }

      return next(e)
    })
  }

  on('ui.render', { component: 'ToolResult' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
}
