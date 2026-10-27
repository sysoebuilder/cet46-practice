import java.util.Properties

plugins { id("com.android.application") }

val dcloudSdk = file(providers.gradleProperty("dcloudSdkDir").get())
val localConfig = Properties().apply {
    rootProject.file("local.properties").takeIf { it.isFile }?.inputStream()?.use { load(it) }
}
val appKey = providers.gradleProperty("cetAppKey").orNull ?: localConfig.getProperty("cet.dcloudAppKey", "")
val generated = layout.buildDirectory.dir("generated/hostAssets")

android {
    namespace = "com.hexun.cet.host"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.hexun.cet46practice.foxlettest"
        minSdk = 28; targetSdk = 35
        versionCode = 13; versionName = "0.1.0-foxlet-test.2"
        manifestPlaceholders["dcloudAppKey"] = appKey
        ndk { abiFilters += "arm64-v8a" }
    }
    flavorDimensions += "content"
    productFlavors {
        create("probe") { dimension = "content"; versionCode = 11 }
        create("full") { dimension = "content"; versionCode = 13 }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { buildConfig = true }
    sourceSets["main"].assets.srcDir(generated.map { it.dir("main") })
    sourceSets["main"].res.srcDir(generated.map { it.dir("res") })
    sourceSets["probe"].assets.srcDir(generated.map { it.dir("probe") })
    sourceSets["full"].assets.srcDir(generated.map { it.dir("full") })
    androidResources { ignoreAssetsPattern = "!.svn:!.git:.*:!CVS:!thumbs.db:!picasa.ini:!*.scc:*~" }
    packaging { jniLibs { useLegacyPackaging = true } }
}

dependencies {
    // Vendor runtime dependencies. No uni-app JS service, compiler or page API.
    implementation(files(
        dcloudSdk.resolve("SDK/libs/lib.5plus.base-release.aar"),
        dcloudSdk.resolve("SDK/libs/uniapp-v8-release.aar"),
        dcloudSdk.resolve("SDK/libs/android-gif-drawable-1.2.29.aar"),
        dcloudSdk.resolve("SDK/libs/oaid_sdk_1.0.25.aar"),
        dcloudSdk.resolve("SDK/libs/breakpad-build-release.aar"),
    ))
    implementation("androidx.appcompat:appcompat:1.1.0")
    implementation("androidx.localbroadcastmanager:localbroadcastmanager:1.0.0")
    implementation("androidx.core:core:1.6.0")
    implementation("androidx.fragment:fragment:1.1.0")
    implementation("androidx.recyclerview:recyclerview:1.1.0")
    implementation("com.facebook.fresco:fresco:3.4.0")
    implementation("com.facebook.fresco:middleware:3.4.0")
    implementation("com.facebook.fresco:animated-gif:3.4.0")
    implementation("com.facebook.fresco:webpsupport:3.4.0")
    implementation("com.facebook.fresco:animated-webp:3.4.0")
    implementation("com.github.bumptech.glide:glide:4.9.0") { exclude(group = "com.android.support") }
    annotationProcessor("com.github.bumptech.glide:compiler:4.9.0")
    implementation("com.alibaba:fastjson:1.2.83")
    implementation("androidx.webkit:webkit:1.5.0")
    implementation("net.lingala.zip4j:zip4j:2.11.5")
    implementation(project(":bridge"))
    implementation(files("../libs/foxlet-v0.5.0.aar"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib:2.4.10")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}

val stageHost by tasks.registering(Exec::class) {
    inputs.dir(dcloudSdk.resolve("SDK/assets"))
    inputs.files(fileTree(dcloudSdk.resolve("SDK/libs")) { include("*.aar") })
    inputs.file(rootProject.file("dcloud-sdk.lock.json"))
    inputs.files(fileTree(rootProject.file("../../app")) { exclude("unpackage/**", ".hbuilderx/**") })
    inputs.dir("src/probe")
    inputs.file(rootProject.file("../../scripts/prepare-5plus-host.py"))
    inputs.file(rootProject.file("../../scripts/build-5plus-probe.mjs"))
    inputs.file(rootProject.file("../../src/translation/translator.mjs"))
    outputs.dir(generated)
    commandLine("python", rootProject.file("../../scripts/prepare-5plus-host.py"),
        "--sdk", dcloudSdk, "--output", generated.get().asFile)
}
tasks.named("preBuild") { dependsOn(stageHost) }
