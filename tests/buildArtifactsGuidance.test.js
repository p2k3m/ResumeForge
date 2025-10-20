import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const guidanceChecklist = [
  'Run the React client build step from the project root (or inside `client/`) using `npm run build`, which invokes Vite’s build pipeline defined in `client/package.json`. This produces the `client/dist` directory that must be uploaded alongside your build artifacts to avoid 404 errors when the site requests static assets.',
  'After the build completes, confirm that the `client/dist` folder exists and contains the generated assets before you push or upload the artifacts.'
]

describe('build artifact documentation', () => {
  it('reminds contributors to generate and upload the client/dist bundle', () => {
    const readmePath = path.join(process.cwd(), 'README.md')
    const readmeContents = readFileSync(readmePath, 'utf8')

    guidanceChecklist.forEach((line) => {
      expect(readmeContents).toContain(line)
    })
  })
})
