# CFI-Care mobile app

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Lab: Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Cookbook: Useful Flutter samples](https://docs.flutter.dev/cookbook)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.


## Common auth errors 
- device time isn't adjusted , mainly an emulator problem :/


## Dev-only setup
### running using specific environment variables
- open env file and set ip to host ip (host = running containers)
- add ip to `CORS_ORIGIN` variable in the backend env file
- in terminal run :
```
    flutter run --dart-define-from-file=env/dev_env.json
```

### copy cert to device , adjust tcp 
#### windows implementation


#### linux implementation

run these cmds in the terminal at the project root dir

```
cd mobile/src/android/app/src/debug/res/

mkdir raw

adb push "$(mkcert -CAROOT)/rootCA.pem" /sdcard/Download/rootCA.pem 



```

### add cert to trusted certs on your mobile device

- open settings
- you could simply search for "install certificate" or continue with the steps if you don't find it


- open security (security and protection)
- select advanced security
- encryption



<!-- cp $(mkcert -CAROOT)/rootCA.pem mobile/src/android/app/src/debug/res/raw/

mv rootCA.pem rootca.pem  -->


<!-- 
# i left a public port open for dev on keycloak
adb reverse tcp:8443 tcp:8443 -->

<!-- not needed ig -->


#### Windows implementation (PowerShell)

Run these commands in a PowerShell terminal at the project root directory. Make sure your emulator is already running so the `adb reverse` command executes successfully.

Fast path (recommended):

```powershell
.\quick-run-scripts\setup_mobile_certs.ps1
```

Manual steps (if needed):

```powershell
# Get the mkcert CA root directory path
$MkcertRoot = mkcert -CAROOT

# Create the raw directory if it doesn't exist
New-Item -ItemType Directory -Force -Path "mobile\src\android\app\src\debug\res\raw"

# Copy the certificate and rename it to rootca.pem (lowercase is required for Android resources)
Copy-Item -Path "$MkcertRoot\rootCA.pem" -Destination "mobile\src\android\app\src\debug\res\raw\rootca.pem"

# Forward the public port for dev on Keycloak 
adb reverse tcp:8443 tcp:8443
adb reverse tcp:3000 tcp:3000

adb devices
adb push ".\security\Containers\certs\rootCA.pem" /sdcard/Download/rootCA.pem
