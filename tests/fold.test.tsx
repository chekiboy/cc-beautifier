import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

function engineDraws(on: On): void {
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
}

const SURFACES = ['terminal', 'desktop'] as const

const AT = new Date(2026, 9, 12, 13, 5, 9).getTime()

const CALL = {
  component: 'ToolUse',
  props: {
    tool_use_id: 'tu1',
    tool: 'Bash',
    input: { command: "printf 'a\\nb\\nc'" },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    output: { stdout: 'one\ntwo\nthree', stderr: '', interrupted: false },
  },
} as const

const RESULT = {
  component: 'ToolResult',
  props: { tool_use_id: 'tu1', tool: 'Bash', output: CALL.props.output, isErrored: false },
} as const

test('a tool row is a box named by its tool: folded, a click anywhere on the header unfolds, copies the full output', async ($, on) => {
  engineDraws(on)
  const copied: string[] = []
  on('ui.copy', async ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  for (const surface of SURFACES) {
    const requestId = `tu-${surface}`
    const row = await $.ui.mount({ plugin: 'cc-beautifier', surface, requestId, ...CALL })
    const result = await $.ui.mount({ plugin: 'cc-beautifier', surface, requestId, ...RESULT })
    await row.resize({ columns: 60, rows: 1 })
    expect(await row.find({ in: `head-${requestId}`, type: 'Text', text: 'Bash' })).toBeDefined()
    expect(await row.find({ in: `head-${requestId}`, text: '▸' })).toBeDefined()
    expect(await row.find({ in: `head-${requestId}`, text: /printf.*· 3 sor/ })).toBeDefined()
    expect(await row.find({ text: 'ENGINE' })).toBeUndefined()
    expect(await result.find({ text: 'ENGINE' })).toBeUndefined()

    await row.pointer({ type: 'down', x: 20, y: 0, button: 'left' })
    await row.pointer({ type: 'up', x: 20, y: 0, button: 'left' })
    expect(await row.find({ in: `head-${requestId}`, text: '▾' })).toBeDefined()
    expect(await row.find({ type: 'Text', text: 'one\ntwo\nthree' })).toBeDefined()
    expect(await row.find({ text: 'ENGINE' })).toBeUndefined()
    expect(await result.find({ text: 'ENGINE' })).toBeUndefined()

    await row.press({ key: 'copy' })
    expect(copied.at(-1)).toBe('one\ntwo\nthree')
    await row.unmount()
    await result.unmount()
  }
})

test('hovering a header lights only that header, without inverting it', async ($, on) => {
  engineDraws(on)
  const one = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'terminal', requestId: 'a', ...CALL })
  const two = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'terminal', requestId: 'b', ...CALL })
  await one.pointer({ type: 'enter', x: 3, y: 0 })
  await one.advance(50)
  expect((await one.find({ in: 'head-a', type: 'Text', text: 'Bash' }))?.props.underline).toBe(true)
  expect((await two.find({ in: 'head-b', type: 'Text', text: 'Bash' }))?.props.underline).toBeFalsy()
  expect((await one.find({ in: 'head-a', type: 'Text', text: 'Bash' }))?.props.inverse).toBeFalsy()
  await one.unmount()
  await two.unmount()
})

test('a surface without Client falls back to a header button', async ($, on) => {
  engineDraws(on)
  const row = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'vscode', ...CALL })
  await row.press({ key: 'toggle' })
  expect(await row.find({ type: 'Text', text: 'one\ntwo\nthree' })).toBeDefined()
  await row.unmount()
})

test('a running call shows as Claude Code draws it, and folds once it is done', async ($, on) => {
  engineDraws(on)
  const row = await $.ui.mount({
    plugin: 'cc-beautifier',
    surface: 'terminal',
    requestId: 'run',
    ...CALL,
    props: { ...CALL.props, isRunning: true, output: undefined },
  })
  expect(await row.find({ text: 'ENGINE' })).toBeDefined()
  expect(await row.find({ key: 'copy' })).toBeUndefined()

  await row.redraw(CALL.props)
  expect(await row.find({ text: 'ENGINE' })).toBeUndefined()
  expect(await row.find({ in: 'head-run', text: '▸' })).toBeDefined()
  await row.unmount()
})

test('two rows toggle independently', async ($, on) => {
  engineDraws(on)
  const one = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'terminal', requestId: 'x1', ...CALL })
  const two = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'terminal', requestId: 'x2', ...CALL })
  await one.pointer({ type: 'up', x: 2, y: 0, button: 'left' })
  expect(await one.find({ in: 'head-x1', text: '▾' })).toBeDefined()
  expect(await two.find({ in: 'head-x2', text: '▸' })).toBeDefined()
  await one.unmount()
  await two.unmount()
})

test('an Edit row unfolds into its diff, not the engine row', async ($, on) => {
  engineDraws(on)
  const row = await $.ui.mount({
    plugin: 'cc-beautifier',
    surface: 'terminal',
    requestId: 'ed',
    component: 'ToolUse',
    props: {
      tool_use_id: 'ed',
      tool: 'Edit',
      input: { file_path: '/tmp/a.ts' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: {
        filePath: '/tmp/a.ts',
        structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }],
      },
    },
  })
  await row.pointer({ type: 'up', x: 2, y: 0, button: 'left' })
  const code = await row.find({ type: 'Code' })
  expect(code?.props.format).toBe('diff')
  expect(code?.props.source).toBe('@@ -1,1 +1,1 @@\n-a\n+b')
  expect(await row.find({ text: 'ENGINE' })).toBeUndefined()
  expect(await row.find({ in: 'head-ed', text: /· 3 sor/ })).toBeDefined()
  await row.unmount()
})

test('with fold off the engine draws every tool row as before', { options: { fold: false } }, async ($, on) => {
  engineDraws(on)
  const row = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'terminal', requestId: 'off', ...CALL })
  expect(await row.find({ text: 'ENGINE' })).toBeDefined()
  await row.unmount()
})

test('/cc-beautifier fold off writes the fold setting; no args shows the state', async ($, on) => {
  const writes: unknown[] = []
  on('config.set', async ($, e) => {
    writes.push([e.key, e.value])
    return { value: e.value }
  })
  mock.clock(on, { now: AT })
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const run = (args: string) =>
    $.command.run({
      command: 'cc-beautifier',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 120 },
    })
  const off = await run('fold off')
  expect(writes).toEqual([['cc-beautifier.fold', false]])
  expect(off.text).toBe('fold: off')
  const status = await run('')
  expect(status.text).toMatch(/^fold: on\ntime: off\nhighlight: on\n/)
})

test('with time on, a reply block shows when it was added; a row with no record shows none', { options: { time: true } }, async ($, on) => {
  engineDraws(on)
  mock.clock(on, { now: AT })
  await $.session.append({
    door: 'response',
    origin: { kind: 'model', model: 'test' },
    uuid: 'r1',
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: 'Kész.' }] },
  })
  const stamped = await $.ui.mount({
    plugin: 'cc-beautifier',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'r1',
    props: { text: 'Kész.', isFirstOfReply: true },
  })
  expect(await stamped.find({ type: 'Text', text: /^13:05$/ })).toBeDefined()
  expect(await stamped.find({ text: 'ENGINE' })).toBeDefined()
  await stamped.unmount()

  const unknown = await $.ui.mount({
    plugin: 'cc-beautifier',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'r2',
    props: { text: 'Régi.', isFirstOfReply: true },
  })
  expect(await unknown.find({ type: 'Text', text: /^\d\d:\d\d$/ })).toBeUndefined()
  await unknown.unmount()
})

test('with time on, a tool box header shows when the call started', { options: { time: true } }, async ($, on) => {
  engineDraws(on)
  mock.clock(on, { now: AT })
  let id = ''
  on('tool.call', async ($, e) => {
    id = e.tool_use_id
    return { result: { stdout: 'a\nb', stderr: '', interrupted: false } }
  })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const row = await $.ui.mount({
    plugin: 'cc-beautifier',
    surface: 'terminal',
    ...CALL,
    requestId: id,
    props: { ...CALL.props, tool_use_id: id },
  })
  expect(await row.find({ type: 'Text', text: '13:05' })).toBeDefined()
  await row.unmount()
})

test('with time on, the first row of each day gets a date line above it', { options: { time: true } }, async ($, on) => {
  engineDraws(on)
  const clock = mock.clock(on, { now: new Date(2026, 9, 12, 23, 58).getTime() })
  const reply = (uuid: string) =>
    $.session.append({
      door: 'response',
      origin: { kind: 'model', model: 'test' },
      uuid,
      message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: uuid }] },
    })
  await reply('first')
  await reply('same-day')
  await clock.advance(5 * 60 * 1000)
  await reply('next-day')
  const dateLine = async (uuid: string) => {
    const ui = await $.ui.mount({
      plugin: 'cc-beautifier',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId: uuid,
      props: { text: uuid, isFirstOfReply: true },
    })
    const found = await ui.find({ type: 'Text', text: /────/ })
    await ui.unmount()
    return found?.text
  }
  expect(await dateLine('first')).toMatch(/2026-10-12/)
  expect(await dateLine('same-day')).toBeUndefined()
  expect(await dateLine('next-day')).toMatch(/2026-10-13/)
})

async function openBox($: Engine, id: string, tool: string, input: unknown, output: unknown) {
  const row = await $.ui.mount({
    plugin: 'cc-beautifier',
    surface: 'terminal',
    requestId: id,
    component: 'ToolUse',
    props: { tool_use_id: id, tool, input, output, isRunning: false, isErrored: false, isInterrupted: false },
  })
  await row.pointer({ type: 'up', x: 2, y: 0, button: 'left' })
  return row
}

test('an open box colours code by what the tool printed', async ($, on) => {
  engineDraws(on)
  const write = await openBox($, 'w', 'Write', { file_path: '/a/b.php', content: '<?php\necho 1;' }, {
    type: 'create', filePath: '/a/b.php', content: '<?php\necho 1;', structuredPatch: [], originalFile: null,
  })
  expect((await write.find({ type: 'Code' }))?.props).toMatchObject({ path: '/a/b.php', source: '<?php\necho 1;' })
  await write.unmount()

  const read = await openBox($, 'r', 'Read', { file_path: '/a/c.py' }, {
    type: 'text', file: { filePath: '/a/c.py', content: 'x = 1\ny = 2', numLines: 2, startLine: 10, totalLines: 40 },
  })
  expect((await read.find({ type: 'Code' }))?.props).toMatchObject({ path: '/a/c.py', startLine: 10 })
  await read.unmount()

  const cat = await openBox($, 'c', 'Bash', { command: 'cat src/x.ts' }, { stdout: 'const a = 1\nconst b = 2', stderr: '', interrupted: false })
  expect((await cat.find({ type: 'Code' }))?.props.path).toBe('src/x.ts')
  await cat.unmount()

  const chained = await openBox($, 'ch', 'Bash', {
    command: 'cd ~/x && grep -n "Code" hooks/register.tsx; sed -n "1,30p" hooks/register.tsx',
  }, { stdout: '297:    const { Text, Code } = $.ui.resolve(e)\nconst a = 1', stderr: '', interrupted: false })
  expect((await chained.find({ type: 'Code', text: /const a = 1/ }))?.props.path).toBe('hooks/register.tsx')
  await chained.unmount()

  const mixed = await openBox($, 'mx', 'Bash', { command: 'cat a.php b.py' }, { stdout: 'x\ny', stderr: '', interrupted: false })
  expect(await mixed.find({ type: 'Code' })).toBeUndefined()
  await mixed.unmount()

  const plain = await openBox($, 'p', 'Bash', { command: 'ls -la' }, { stdout: 'a\nb', stderr: '', interrupted: false })
  expect(await plain.find({ type: 'Code' })).toBeUndefined()
  expect(await plain.find({ type: 'Text', text: 'a\nb' })).toBeDefined()
  await plain.unmount()

  const agent = await openBox($, 'g', 'Agent', { prompt: 'look' }, { agentId: 'x', content: [{ type: 'text', text: '# Done\n```php\necho 1;\n```' }] })
  expect((await agent.find({ type: 'Markdown' }))?.props.text).toMatch(/```php/)
  await agent.unmount()
})

test('an open Bash box shows a long or multi-line command above its output', async ($, on) => {
  engineDraws(on)
  const script = 'python3 -c "\nfor i in range(3):\n    print(i)\n"'
  const row = await openBox($, 'py', 'Bash', { command: script }, { stdout: '0\n1\n2', stderr: '', interrupted: false })
  const code = await row.find({ type: 'Code' })
  expect(code?.props).toMatchObject({ source: script, language: 'bash' })
  expect(await row.find({ type: 'Text', text: '0\n1\n2' })).toBeDefined()
  await row.unmount()
})
