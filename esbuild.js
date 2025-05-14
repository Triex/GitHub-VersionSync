const esbuild = require('esbuild');

// Bundle the extension
esbuild.build({
  entryPoints: ['./out/extension.js'],
  bundle: true,
  outfile: './dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  minify: true,
  sourcemap: false,
}).catch(() => process.exit(1));
