#!/bin/bash

# 1. Convert current directory to Windows format (e.g., C:\Users\...)
#    This handles spaces correctly (like in "Fall 2025")
DIR_WIN=$(wslpath -w "$(pwd)")

# 2. Launch tabs
#    -w 0        : Attach to current window
#    nt          : New tab
#    -d "$DIR_WIN": Set starting directory to current project folder
#    wsl.exe     : The command to run (enters Linux)

wt.exe -w 0 nt --title "Keycloak" -d "$DIR_WIN" wsl.exe bash -c "./start_kc_containers.sh; exec bash" &
wt.exe -w 0 nt --title "Nginx"    -d "$DIR_WIN" wsl.exe bash -c "./start_nginx_containers.sh; exec bash" &
wt.exe -w 0 nt --title "FHIR"     -d "$DIR_WIN" wsl.exe bash -c "./start_fhir_container.sh; exec bash" &
wt.exe -w 0 nt --title "Frontend" -d "$DIR_WIN" wsl.exe bash -c "./start_frontend.sh; exec bash" &
wt.exe -w 0 nt --title "NodeJS"   -d "$DIR_WIN" wsl.exe bash -c "./start_nodejs_containers.sh; exec bash" &