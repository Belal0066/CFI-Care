# medflow

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

cp $(mkcert -CAROOT)/rootCA.pem mobile/src/android/app/src/debug/res/raw/

mv rootCA.pem rootca.pem 


```

<!-- 
# i left a public port open for dev on keycloak
adb reverse tcp:8443 tcp:8443 -->

<!-- not needed ig -->
<!-- adb push "$(mkcert -CAROOT)/rootCA.pem" /sdcard/Download/rootCA.pem -->

<!-- ### add cert to trusted certs on your mobile device

- open settings
- you could simply search for "install certificate" or continue with the steps if you don't find it


- open security (security and protection)
- select advanced security
- encryption
-  -->

