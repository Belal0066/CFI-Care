 #!/bin/bash

gnome-terminal -- bash -c "./start_kc_containers.sh; exec bash"
gnome-terminal -- bash -c "./start_nodejs_containers.sh; exec bash"
gnome-terminal -- bash -c "./start_fhir_container.sh; exec bash"
gnome-terminal -- bash -c "./start_frontend.sh; exec bash"
gnome-terminal -- bash -c "./start_nginx_containers.sh; exec bash"