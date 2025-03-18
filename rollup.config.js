import { nodeResolve } from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default {
    input: './js/app.js',
    output: {
        file: 'dist/app.js',
        format: 'es'
    },
    plugins: [
        nodeResolve(),
        copy({
            targets: [
                { src: 'index.html', dest: 'dist' },
                { src: 'css/**/*', dest: 'dist/css' },
                { src: 'img/**/*', dest: 'dist/img' },
                { src: 'data/**/*', dest: 'dist/data' }
            ]
        })
    ]
};