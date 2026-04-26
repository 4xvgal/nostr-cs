import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  splitting: false,
  // nostr-tools is a runtime dep — leave external so consumers can dedupe.
  external: ['nostr-tools'],
})
