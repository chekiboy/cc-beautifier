export type CcBeautifierRowId = string

declare module 'claude-code' {
  interface PluginState {
    'cc-beautifier': {
      isOpen: StateFamily<boolean | null>
      times: StateFamily<number>
      dayStarts: StateFamily<string>
      lastDay: string
    }
  }
}
