$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$root`"; ./start_kc_containers.ps1"

Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$root`"; ./start_nginx_containers.ps1"

Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$root`"; ./start_fhir_container.ps1"

# njs in current window?
& "$root/start_nodejs_containers.ps1"
