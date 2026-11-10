#!/bin/bash
# Gera site/index.html a partir de src/ e confere a sintaxe dos scripts embutidos.
set -euo pipefail
cd "$(dirname "$0")"
SUPABASE_URL="https://zcqyspaggvrwljsbnuqx.supabase.co"
SUPABASE_KEY="sb_publishable_RljREHVyBV75M-ynxTsagw_NoLioeSx"   # chave pública (publishable), já exposta no site
python3 src/port.py src/app-base.html site/index.html src "$SUPABASE_URL" "$SUPABASE_KEY"
node -e "const s=require('fs').readFileSync('site/index.html','utf8');let bad=0;[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(x=>{try{new Function(x[1])}catch(e){bad++;console.log('ERRO DE SINTAXE:',e.message)}});if(bad)process.exit(1);console.log('sintaxe ok')"
