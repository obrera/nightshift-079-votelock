import { createBrowserRouter } from 'react-router'

import { ShellUiLoader } from '@/shell/feature'
import { VoteLockFeature } from '@/votelock/feature/votelock-feature'

export const appRouter = createBrowserRouter(
  [
    {
      element: <VoteLockFeature />,
      hydrateFallbackElement: <ShellUiLoader fullScreen />,
      path: '*',
    },
  ],
  {
    // Set the base URL for router links and redirects, removing trailing slashes if present, independent of the base
    basename: import.meta.env.BASE_URL === '/' ? '/' : import.meta.env.BASE_URL.replace(/\/$/, ''),
  },
)
