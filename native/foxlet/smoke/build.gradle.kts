plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.hexun.cet.foxlet.smoke"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.hexun.cet.foxlet.smoke"
        minSdk = 28; targetSdk = 35; versionCode = 1; versionName = "0.5.0-test"
        ndk { abiFilters += "arm64-v8a" }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging { jniLibs { useLegacyPackaging = true } }
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies {
    implementation(project(":bridge"))
    implementation(files("../libs/foxlet-v0.5.0.aar"))
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
