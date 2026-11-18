import { mergeConfig } from 'vite';
import base from './vite.config.ts';
import { readerBoundary } from './scripts/lib/reader-boundary.mjs';
export default mergeConfig(base, {
  root: 'reader',
  publicDir: '../public',
  base: '/',
  plugins: [readerBoundary(), {
    name:'private-reader-preview',
    transformIndexHtml:{order:'pre',handler(html:string){return html.replace('</head>','<meta name="robots" content="noindex, nofollow, noarchive"></head>');}}
  }],
});
