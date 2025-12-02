
set -eou pipefail
while ! docker info >/dev/null 2>&1; do
    sleep 5
done
cd backend/src/Nodejs/
 export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"
 node index.js

