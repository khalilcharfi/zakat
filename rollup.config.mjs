import { nodeResolve } from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default {
    input: './js/app.js',
    output: {
        dir: 'dist',
        format: 'iife', // Immediately Invoked Function Expression
        name: 'ZakatCalculator'
    },
    plugins: [
        nodeResolve(),
        copy({
            targets: [
                { src: 'index.html', dest: 'dist' },
                { src: 'style.css', dest: 'dist' }
            ]
        })
    ]
};