// Preview the built Vue app with Range support for offline audio seeking.
// Vite's static server supports HTTP Range, which audio seeking needs.
export default {
  build: { outDir: 'dist/build/h5' },
  preview: { host: '0.0.0.0', port: 5175 },
}
