export default {
  root: process.cwd(),
  envDir: '../..',
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
  },
}
