/** Isolated static preview: root assets, no remote database or font traffic. */
import {mergeConfig} from 'vite';
import application from './vite.config.ts';
export default mergeConfig(application, {
  base:'/',
  define:{
    'import.meta.env.VITE_STATIC_PREVIEW':JSON.stringify('true'),
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(''),
    'import.meta.env.VITE_ALLOW_REMOTE_SUPABASE_IN_LOCAL':JSON.stringify('false'),
  },
  plugins:[{
    name:'isolated-static-preview',
    transformIndexHtml:{order:'pre',handler(html:string){return html
      .replace(/^.*<link[^>]+https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*$/gm,'')
      .replace('</head>','<meta name="robots" content="noindex, nofollow, noarchive">\n</head>');}},
  }],
});
