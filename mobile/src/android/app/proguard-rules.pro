# ucrop uses OkHttp3 optionally (for remote image downloads). Since the app
# does not use that code path, suppress the missing-class warnings so R8 can
# strip the dead references without failing the build.
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
