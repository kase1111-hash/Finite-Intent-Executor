import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Dev server only: extend the Content-Security-Policy in index.html so the
 * page can reach the local Hardhat node, which the "Use Local Dev Account"
 * option and the local chain tools call directly. Production builds keep the
 * strict policy ([Audit fix: I-5]).
 */
function allowLocalNodeInDev(rpcUrl) {
  const origins = new Set(['http://127.0.0.1:8545', 'http://localhost:8545'])
  if (rpcUrl) origins.add(new URL(rpcUrl).origin)

  return {
    name: 'fie-dev-local-node-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("connect-src 'self'", `connect-src 'self' ${[...origins].join(' ')}`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  return {
    plugins: [react(), tailwindcss(), allowLocalNodeInDev(env.VITE_RPC_URL)],
    server: {
      port: 3000,
      // Opens a browser tab when one can be launched (not in headless shells)
      open: !process.env.CI && process.env.BROWSER !== 'none',
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks - split large dependencies
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ethers': ['ethers'],
            'vendor-ui': ['lucide-react', 'react-hot-toast'],
            'vendor-utils': ['date-fns'],
          }
        }
      }
    }
  }
})
