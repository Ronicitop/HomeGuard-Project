import react from '@vitejs/plugin-react';import {defineConfig} from 'vite';
const proxy={'/api':{target:process.env.API_PROXY_TARGET||'http://127.0.0.1:3000'},'/media':{target:process.env.MEDIA_PROXY_TARGET||'http://127.0.0.1:8889',changeOrigin:true,rewrite:(path:string)=>path.replace(/^\/media/,'')}};
export default defineConfig({plugins:[react()],server:{host:'0.0.0.0',proxy},preview:{proxy}});
