import fs from 'node:fs'
import path from 'node:path'
// Audio is about 1 GB. Copy only changed files during repeated/watch builds.
export function copyResources(source, target) {
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const input = path.join(source, entry.name), output = path.join(target, entry.name)
    if (entry.isDirectory()) copyResources(input, output)
    else {
      const a = fs.statSync(input), b = fs.existsSync(output) ? fs.statSync(output) : null
      if (!b || a.size !== b.size || a.mtimeMs > b.mtimeMs + 1) {
        fs.copyFileSync(input, output)
        fs.utimesSync(output, a.atime, a.mtime)
      }
    }
  }
}
