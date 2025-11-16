#!/bin/bash

gnome-terminal -- bash -c "./start_sec_containers.sh;
exec bash"

./start_backend_containers.sh
