// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  // Define the base path for deployment (IMPORTANT!)
  // Replace 'flight-sim-project' with your actual GitHub repository name
  base: '/flight-sim-project/',

  // Optional: Specify the build output directory (default is 'dist')
  build: {
    outDir: 'dist',
  },

  // Optional: Specify the source directory (if your JS code isn't in the root)
  // By default, Vite looks for index.html in the root.
  // If your main script is inside the 'js' folder, Vite should find it via the
  // <script type="module" src="/js/main.js"></script> tag in your index.html
  // You usually don't need 'root' or 'resolve.alias' unless your structure is complex.

  // If you were using a framework like React/Vue, you'd add plugins here:
  // plugins: [react()],
});