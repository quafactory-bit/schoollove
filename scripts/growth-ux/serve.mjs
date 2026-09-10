// Local-only real-component harness. No production route or external service.
import { createServer } from 'vite'
import path from 'node:path'
const root = process.cwd()
const mocks = ['lib/user-auth','lib/publicAccountLaunch','lib/schoolGrowthGame','lib/api/schools','lib/api/search','lib/beta','lib/promotions','lib/auth/social-broker/preview-config','lib/ownerSchoolGrowth','lib/seo']
const server = await createServer({
  configFile: false, root, envDir: false,
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: [
    ...mocks.map(x => ({ find: `@/${x}`, replacement: path.join(root,'scripts/growth-ux/data.jsx') })),
    { find: 'next/navigation', replacement: path.join(root,'scripts/growth-ux/navigation.jsx') },
    { find: 'next/link', replacement: path.join(root,'scripts/growth-ux/link.jsx') },
    { find: 'next/image', replacement: path.join(root,'scripts/game-visual/image.jsx') },
    { find: '@', replacement: root },
  ] },
  plugins: [{ name:'local-ui', configureServer(s) { s.middlewares.use((req,res,next) => {
    if (req.headers.accept?.includes('text/html') && !req.url.startsWith('/@')) {
      res.setHeader('Content-Type','text/html'); res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local React UX fixture</title><div id="root"></div><script type="module" src="/scripts/growth-ux/fixture.jsx"></script></html>')
    } else next()
  }) } }], server:{host:'127.0.0.1',port:3117,strictPort:true},
})
await server.listen(); console.log('UX_REACT_FIXTURE http://127.0.0.1:3117')
