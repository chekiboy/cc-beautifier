import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

function engineDraws(on: On): void {
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
}

const SURFACES = ['terminal', 'desktop'] as const

function message(origin: { kind: string }, extra: Record<string, unknown> = {}) {
  return {
    component: 'UserMessage',
    props: { text: 'Kész a review.\nKét találat.', origin, isExpanded: true, ...extra },
  } as const
}

const FROM_AGENT = message({ kind: 'peer-send-message' }, { from: { name: 'reviewer' } })

test('a message from another agent is a folded box named by its sender: a click opens it, copy copies it all', async ($, on) => {
  engineDraws(on)
  const copied: string[] = []
  on('ui.copy', async ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  for (const surface of SURFACES) {
    const requestId = `m-${surface}`
    const row = await $.ui.mount({ plugin: 'cc-beautifier', surface, requestId, ...FROM_AGENT } as never)
    expect(await row.find({ text: 'ENGINE' })).toBeUndefined()
    expect(await row.find({ in: `head-${requestId}`, type: 'Text', text: 'reviewer' })).toBeDefined()
    expect(await row.find({ in: `head-${requestId}`, type: 'Text', text: '»' })).toBeDefined()
    expect(await row.find({ in: `head-${requestId}`, text: /Kész a review\. · 2 sor/ })).toBeDefined()
    expect(await row.find({ in: `head-${requestId}`, text: '▸' })).toBeDefined()
    expect(await row.find({ text: /Két találat/ })).toBeUndefined()

    await row.pointer({ type: 'up', x: 6, y: 1, button: 'left' })
    expect(await row.find({ in: `head-${requestId}`, text: '▾' })).toBeDefined()
    expect(await row.find({ text: /Két találat/ })).toBeDefined()

    await row.press({ key: 'copy' })
    expect(copied.at(-1)).toBe('Kész a review.\nKét találat.')
    await row.unmount()
  }
})

test('the sender mark has its own colour, unlike a tool call', async ($, on) => {
  engineDraws(on)
  const row = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'terminal', requestId: 'c1', ...FROM_AGENT } as never)
  expect((await row.find({ in: 'head-c1', type: 'Text', text: '»' }))?.props.color).toBe('permission')
  await row.unmount()
})

test('a background task notification is boxed too, with its status, red when it failed', async ($, on) => {
  engineDraws(on)
  const done = await $.ui.mount({
    plugin: 'cc-beautifier',
    surface: 'terminal',
    requestId: 'n1',
    ...message({ kind: 'task-notification' }, { task: { id: 't1', status: 'completed' } }),
  } as never)
  expect(await done.find({ text: 'ENGINE' })).toBeUndefined()
  expect(await done.find({ in: 'head-n1', type: 'Text', text: 'háttérfeladat' })).toBeDefined()
  expect(await done.find({ in: 'head-n1', text: /completed · 2 sor/ })).toBeDefined()
  await done.unmount()

  const failed = await $.ui.mount({
    plugin: 'cc-beautifier',
    surface: 'terminal',
    requestId: 'n2',
    ...message({ kind: 'task-notification' }, { task: { id: 't2', status: 'failed' } }),
  } as never)
  expect((await failed.find({ in: 'head-n2', type: 'Text', text: '»' }))?.props.color).toBe('error')
  await failed.unmount()
})

test('your own prompt is not boxed', async ($, on) => {
  engineDraws(on)
  const row = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'terminal', requestId: 'p1', ...message({ kind: 'composer' }) } as never)
  expect(await row.find({ text: 'ENGINE' })).toBeDefined()
  expect(await row.find({ key: 'copy' })).toBeUndefined()
  await row.unmount()
})

test('a surface without Client opens the message box with a button', async ($, on) => {
  engineDraws(on)
  const row = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'vscode', requestId: 'v1', ...FROM_AGENT } as never)
  await row.press({ key: 'toggle' })
  expect(await row.find({ text: /Két találat/ })).toBeDefined()
  await row.unmount()
})

test('with fold off Claude Code draws messages from others as before', { options: { fold: false } }, async ($, on) => {
  engineDraws(on)
  const row = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'terminal', requestId: 'f1', ...FROM_AGENT } as never)
  expect(await row.find({ text: 'ENGINE' })).toBeDefined()
  await row.unmount()
})
