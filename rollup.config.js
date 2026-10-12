import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/bastion.js',
      format: 'umd',
      name: 'Bastion',
      sourcemap: true,
    },
    {
      file: 'dist/bastion.esm.js',
      format: 'es',
      sourcemap: true,
    },
  ],
  plugins: [
    typescript({ tsconfig: './tsconfig.json' }),
    terser(),
  ],
};
