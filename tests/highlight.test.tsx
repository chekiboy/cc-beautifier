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

function prompt(origin: { kind: string }, extra: Record<string, unknown> = {}) {
  return { component: 'UserMessage', props: { text: 'szia', origin, isExpanded: true, ...extra } } as const
}

const REPLY = { component: 'AssistantMessage', props: { text: 'Kész.', isFirstOfReply: true } } as const

async function barColor($: Engine, row: Record<string, unknown>, surface: 'terminal' | 'desktop' = 'terminal') {
  const ui = await $.ui.mount({ plugin: 'cc-beautifier', surface, requestId: 'm1', ...row } as never)
  expect(await ui.find({ text: 'ENGINE' })).toBeDefined()
  const bar = await ui.find({ key: 'bar' })
  const color = (await ui.find({ type: 'Text', text: /^┃\n┃/ }))?.props.color
  expect(bar === undefined).toBe(color === undefined)
  await ui.unmount()
  return color
}

test('your prompt and Claude reply get a coloured bar, on every surface', async ($, on) => {
  engineDraws(on)
  for (const surface of SURFACES) {
    expect(await barColor($, prompt({ kind: 'composer' }), surface)).toBe('suggestion')
    expect(await barColor($, prompt({ kind: 'bridge' }), surface)).toBe('suggestion')
    expect(await barColor($, REPLY, surface)).toBe('claude')
  }
})

test('notifications, messages from others and reply summaries get no bar', { options: { fold: false } }, async ($, on) => {
  engineDraws(on)
  expect(await barColor($, prompt({ kind: 'task-notification' }, { task: { id: 't1', status: 'completed' } }))).toBeUndefined()
  expect(await barColor($, prompt({ kind: 'peer' }, { from: { name: 'other' } }))).toBeUndefined()
  expect(await barColor($, prompt({ kind: 'unclassified' }))).toBeUndefined()
  expect(await barColor($, prompt({ kind: 'composer' }, { from: { name: 'agent' } }))).toBeUndefined()
  expect(await barColor($, { ...REPLY, props: { ...REPLY.props, isSummary: true } })).toBeUndefined()
})

test('with highlight off the engine draws messages as before', { options: { highlight: false } }, async ($, on) => {
  engineDraws(on)
  expect(await barColor($, prompt({ kind: 'composer' }))).toBeUndefined()
  expect(await barColor($, REPLY)).toBeUndefined()
})

test('with fold off messages are still highlighted', { options: { fold: false } }, async ($, on) => {
  engineDraws(on)
  expect(await barColor($, REPLY)).toBe('claude')
})

test('with time on, a reply still gets its time, its date line and its bar', { options: { time: true } }, async ($, on) => {
  engineDraws(on)
  mock.clock(on, { now: new Date(2026, 9, 13, 9, 30).getTime() })
  await $.session.append({
    door: 'response',
    origin: { kind: 'model', model: 'test' },
    uuid: 'r1',
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: 'Kész.' }] },
  })
  const ui = await $.ui.mount({ plugin: 'cc-beautifier', surface: 'terminal', requestId: 'r1', ...REPLY })
  expect(await ui.find({ key: 'bar' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '09:30' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2026-10-13/ })).toBeDefined()
  await ui.unmount()
})
