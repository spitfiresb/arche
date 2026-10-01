#!/bin/sh
# Serve public/ on http://localhost:8765 with Agentation injected into every
# HTML page. Dev only; nothing here touches the deployed site.
cd "$(dirname "$0")/../.." || exit 1
exec node -e '
const http=require("http"),fs=require("fs"),path=require("path");
const root=path.resolve("public"),loader=fs.readFileSync("tools/agentation/agentation.js","utf8");
const types={".html":"text/html",".css":"text/css",".js":"text/javascript",".svg":"image/svg+xml",".png":"image/png",".woff2":"font/woff2",".json":"application/json"};
http.createServer((req,res)=>{
  let p;
  try{p=decodeURIComponent(req.url.split("?")[0]);}catch{res.writeHead(400);return res.end("bad request");}
  // Never serve outside public/: .dev.vars sits one level up.
  let f=path.resolve(root,"."+path.posix.normalize("/"+p));
  if(f!==root&&!f.startsWith(root+path.sep)){res.writeHead(404);return res.end("not found");}
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,"index.html");
  else if(!fs.existsSync(f)&&fs.existsSync(f+".html"))f+=".html";
  if(!fs.existsSync(f)){res.writeHead(404);return res.end("not found");}
  const ext=path.extname(f);
  let body=fs.readFileSync(f);
  if(ext===".html")body=Buffer.from(body.toString().replace(/<\/body>/i,`<script>${loader}</script></body>`));
  res.writeHead(200,{"content-type":types[ext]||"application/octet-stream"});res.end(body);
}).listen(8765,"127.0.0.1",()=>console.log("http://localhost:8765  (Agentation injected)"));
'
