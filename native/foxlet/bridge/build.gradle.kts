import java.security.MessageDigest

plugins { id("com.android.library"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.hexun.cet.foxlet"
    compileSdk = 36
    defaultConfig {
        minSdk = 28; consumerProguardFiles("consumer-rules.pro")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/assets"))
    testOptions { unitTests.isReturnDefaultValues = true }
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies {
    // Local AARs cannot be nested inside a library AAR. The host explicitly packages it.
    compileOnly(files("../libs/foxlet-v0.5.0.aar"))
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
}
val prepareAssets by tasks.registering(Sync::class) {
    from("../models") { into("foxlet/en-zh-Hans-2.2") }
    from("../foxlet.lock.json") { into("foxlet") }
    from("../licenses") { into("foxlet/licenses") }
    inputs.file("../libs/foxlet-v0.5.0.aar")
    into(layout.buildDirectory.dir("generated/assets"))
    doFirst {
        val lock = groovy.json.JsonSlurper().parse(file("../foxlet.lock.json")) as Map<*, *>
        fun sha256(file: java.io.File): String {
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { source ->
                val buffer = ByteArray(65536)
                while (true) { val size = source.read(buffer); if (size < 0) break; digest.update(buffer, 0, size) }
            }
            return digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
        }
        check(sha256(file("../libs/foxlet-v0.5.0.aar")) == lock["sdkSha256"]) { "SDK integrity failed" }
        (lock["assets"] as List<*>).forEach { raw ->
            val asset = raw as Map<*, *>
            val model = file("../models/${asset["name"]}")
            check(model.isFile && model.length() == (asset["size"] as Number).toLong() && sha256(model) == asset["sha256"]) {
                "Model integrity failed. Run python scripts/prepare-foxlet.py"
            }
        }
    }
}
tasks.named("preBuild") { dependsOn(prepareAssets) }
