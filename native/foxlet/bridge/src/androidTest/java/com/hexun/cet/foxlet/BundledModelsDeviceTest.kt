package com.hexun.cet.foxlet

import android.content.ContextWrapper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

/** Real APK AssetManager + private storage; independent of ARM inference. */
@RunWith(AndroidJUnit4::class)
class BundledModelsDeviceTest {
    @Test fun copiesOnceSurvivesNewInstallerAndRepairsInterruptedOrCorruptFiles() {
        val base = InstrumentationRegistry.getInstrumentation().targetContext
        val sandbox = File(base.cacheDir, "foxlet-install-test-${UUID.randomUUID()}")
        val context = object : ContextWrapper(base) { override fun getNoBackupFilesDir(): File = sandbox }
        try {
            val installer = BundledModels(context)
            val directory = installer.install()
            assertEquals(4, directory.listFiles()!!.size)
            val before = directory.listFiles()!!.associate { it.name to it.lastModified() }
            // New installer instance reads the persisted files like a fresh process.
            val reused = BundledModels(context).install()
            assertEquals(directory.canonicalPath, reused.canonicalPath)
            assertEquals(before, reused.listFiles()!!.associate { it.name to it.lastModified() })
            val corrupt = File(directory, "srcvocab.enzh.spm")
            corrupt.writeBytes(byteArrayOf(1, 2, 3))
            val staging = File(directory.parentFile, "en-zh-Hans-2.2.staging").apply { mkdirs() }
            File(staging, "interrupted.part").writeText("incomplete")
            val repaired = BundledModels(context).install()
            assertFalse(staging.exists())
            for (spec in installer.specs) {
                val file = File(repaired, spec.name)
                assertEquals(spec.size, file.length())
                assertEquals(spec.sha256, file.inputStream().use { BundledModels.sha256(it) })
            }
        } finally { sandbox.deleteRecursively() }
    }
}
