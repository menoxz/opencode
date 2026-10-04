import { useFile } from "@/context/file"

/**
 * Hook to open a file in preview via the existing tab system.
 *
 * Usage:
 * ```ts
 * const { openFile } = useOpenFile()
 * openFile("/path/to/file.ts")
 * ```
 *
 * Returns the tab ID so callers can track it if needed.
 */
export function useOpenFile() {
  const file = useFile()

  return {
    /**
     * Open a file in preview by creating/activating a tab for it.
     * @param path - Absolute file path
     * @returns The tab identifier string (prefixed for the tab system)
     */
    openFile: (path: string) => {
      const tabId = file.tab(path)
      // The tab is now available in the layout's tab list.
      // Integration with session-side-panel:
      //   - FileTabContent already renders file content for file:// tabs
      //   - To open the tab: tabs().open(tabId) + tabs().setActive(tabId)
      //   - Callers with layout access should do this after openFile()
      return tabId
    },
  }
}
