set -euo pipefail

node -e "const [maj]=process.versions.node.split('.').map(Number); if(maj < 20 || maj >= 23){ console.error('Unsupported Node version for docs build: ' + process.versions.node + '. Use Node 20-22.'); process.exit(1); }"

npx webpack
cp dist/fumen.js* ./docsrc/docs/js/
#cp dist/fumen.js* ./demo/
cp -r dist/lib/*.js ./docsrc/docs/lib/

node apidocmaker.js > docsrc/docs/api_reference.md
cd docsrc
mkdocs build
cd ..

cp -r docsrc/playground ./docs/
