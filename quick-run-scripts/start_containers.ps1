# 1. Get current directory
$Dir = $PWD.Path

# 2. Launch tabs
#    We added "-ExecutionPolicy Bypass" to every line.
#    This allows the script to run without changing your global PC settings.

wt.exe -w 0 `
    nt --title "Keycloak" -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_kc_containers.ps1" `; `
    nt --title "Nginx"    -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_nginx_containers.ps1" `; `
    nt --title "FHIR"     -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_fhir_container.ps1" `; `
    nt --title "Frontend" -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_frontend.ps1" `; `
    nt --title "NodeJS"   -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_nodejs_containers.ps1"