package com.hexun.cet.foxlet

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.security.MessageDigest

internal data class AssetSpec(val name: String, val size: Long, val sha256: String)

/** Immutable versioned publication; interrupted copies never become usable models. */
internal class BundledModels(private val context: Context) {
    val specs: List<AssetSpec> by lazy {
        val json = context.assets.open("foxlet/foxlet.lock.json").bufferedReader().use { JSONObject(it.readText()) }
        check(json.getString("sdkVersion") == "0.5.0")
        val assets = json.getJSONArray("assets")
        (0 until assets.length()).map { index ->
            val asset = assets.getJSONObject(index)
            val name = asset.getString("name")
            require(name.matches(Regex("[a-zA-Z0-9.-]+")))
            AssetSpec(name, asset.getLong("size"), asset.getString("sha256"))
        }.also { check(it.size == 4) }
    }

    fun install(): File {
        val root = File(context.noBackupFilesDir, "cet-foxlet").apply { check(mkdirs() || isDirectory) }
        val destination = File(root, "en-zh-Hans-2.2")
        // Hash on each process initialization, not on each request; repairs bit rot too.
        if (valid(destination)) return destination
        val staging = File(root, "en-zh-Hans-2.2.staging")
        check(!staging.exists() || staging.deleteRecursively())
        check(staging.mkdirs())
        try {
            check(root.usableSpace > specs.sumOf { it.size } + 8 * 1024 * 1024) { "STORAGE_FULL" }
            for (spec in specs) {
                val target = File(staging, spec.name)
                context.assets.open("foxlet/en-zh-Hans-2.2/${spec.name}").use { source ->
                    target.outputStream().use { output -> source.copyTo(output); output.fd.sync() }
                }
                check(matches(target, spec)) { "MODEL_CORRUPT" }
            }
            check(valid(staging)) { "MODEL_CORRUPT" }
            check(!destination.exists() || destination.deleteRecursively())
            check(staging.renameTo(destination)) { "MODEL_STORAGE" }
            return destination
        } finally { if (staging.exists()) staging.deleteRecursively() }
    }

    private fun valid(directory: File) = directory.isDirectory && specs.all { matches(File(directory, it.name), it) }

    private fun matches(file: File, spec: AssetSpec): Boolean =
        file.isFile && file.length() == spec.size && file.inputStream().use { sha256(it) } == spec.sha256

    companion object {
        internal fun sha256(input: InputStream): String {
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(64 * 1024)
            while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
            return digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
        }
    }
}
