import { nodeResolve } from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default {
    input: './js/app.js',
    output: {
        dir: 'dist',
        format: 'iife',
        name: 'ZakatCalculator'
    },
    plugins: [
        nodeResolve(),
        copy({
            targets: [
                { src: 'index.html', dest: 'dist' },
                { src: 'style.css', dest: 'dist' },
                { src: 'img/**/*', dest: 'dist/img' },
                { src: 'js/**/*', dest: 'dist/js' }
            ]
        })
    ]
};