import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/bastion.js',
      format: 'umd',
      name: 'BastionSDK',
      exports: 'named',
      sourcemap: true,
    },
    {
      file: 'dist/bastion.esm.mjs',
      format: 'es',
      sourcemap: true,
    },
  ],
  plugins: [
    nodeResolve({browser: true}),
    typescript({ tsconfig: './tsconfig.json' }),
  ],
};
