import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'serve'
    ? '/'
    : '/MT4-Robotic-Arm-Playground/',
}));