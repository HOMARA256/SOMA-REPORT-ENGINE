import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    // Keep TypeScript/TSX source files ahead of stale JavaScript build mirrors
    // when resolving extensionless imports from the application source.
    resolve: {
        extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.mts', '.json'],
    },
});
