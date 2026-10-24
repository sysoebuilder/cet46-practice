import fs from 'node:fs'
import path from 'node:path'

// Classic scripts work both in an installed APK's assets and in the debug base.
// Keep papers separate: opening one paper must not parse the whole library.
export function packagePapers(source, target) {
  fs.mkdirSync(target, { recursive: true })
  for (const name of fs.readdirSync(source).filter(name => /^CET[46]-\d{4}-\d{2}-[123]\.json$/.test(name))) {
    const json = JSON.stringify(JSON.parse(fs.readFileSync(path.join(source, name), 'utf8')))
      .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
    const script = `document.currentScript.__cetPaper = ${json};\n`
    const output = path.join(target, name.replace(/\.json$/, '.js'))
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== script) fs.writeFileSync(output, script)
  }
}
