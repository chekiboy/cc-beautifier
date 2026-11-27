import type { ClientModule } from 'claude-code'

export type HeaderProps = {
  tool: string
  summary: string
  status: string
  tone: 'success' | 'error' | 'running' | 'agent'
  isExpanded: boolean
  mark?: string
}

type HeaderState = { isHovered: boolean }

export function toneColor(tone: HeaderProps['tone']): 'success' | 'error' | 'permission' | undefined {
  return tone === 'running' ? undefined : tone === 'agent' ? 'permission' : tone
}

const Header: ClientModule<HeaderProps, HeaderState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const isHovered = surface.state?.isHovered ?? false
  surface.onPointer(event => {
    if (event.type === 'enter' || event.type === 'leave') {
      surface.setState({ isHovered: event.type === 'enter' })
    } else if (event.type === 'up' && event.button === 'left') {
      surface.post({ toggle: true, isExpanded: props.isExpanded })
    }
  })

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={toneColor(props.tone)} dimColor={props.tone === 'running'}>
        {props.mark ?? '⏺'}
      </Text>
      <Text bold underline={isHovered}>
        {props.tool}
      </Text>
      <Text>{props.isExpanded ? '▾' : '▸'}</Text>
      <Text dimColor={!isHovered}>
        {props.summary} · {props.status}
      </Text>
    </Box>
  )
}

export default Header
