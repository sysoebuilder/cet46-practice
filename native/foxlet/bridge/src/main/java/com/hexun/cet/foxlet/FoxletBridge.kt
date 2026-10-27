package com.hexun.cet.foxlet

import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import io.github.yinvoker.foxlet.*
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicInteger
import kotlin.time.Duration.Companion.seconds

/** One client per application process. No Activity, WebView or callback is retained by it. */
class FoxletBridge private constructor(private val context: Context) : ComponentCallbacks2 {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val gate = Mutex()
    private val main = Handler(Looper.getMainLooper())
    private val pending = AtomicInteger()
    private var client: Foxlet? = null
    private var model: ExternalModel? = null
    @Volatile private var initCount = 0
    @Volatile private var state = "idle"
    @Volatile private var lastError = ""

    init { context.registerComponentCallbacks(this) }

    fun getStatus(): String = JSONObject().put("state", state).put("ready", isReady())
        .put("error", lastError).put("sdkVersion", "0.5.0").put("initializations", initCount)
        .put("pending", pending.get()).toString()

    fun isReady(): Boolean = state == "ready"

    fun init(requestId: String, callback: FoxletCallback) = submit(requestId, callback) {
        ensureReady()
        getStatus()
    }

    fun translate(text: String, requestId: String, callback: FoxletCallback) = submit(requestId, callback) {
        require(text.isNotBlank() && text.length <= 4000) { "TEXT_LIMIT" }
        ensureReady()
        try { client!!.translator.translate(text, model!!) }
        catch (error: Throwable) {
            // Releasing waits for any native batch; never delete files while in use.
            if (error is OutOfMemoryError || error is ModelIntegrityException) {
                closeClient(); state = "error"
            }
            throw error
        }
    }

    /** Global release. Pages should close UI only; call this when all consumers finish. */
    fun destroy(requestId: String, callback: FoxletCallback) = submit(requestId, callback, control = true) {
        state = "closing"
        closeClient()
        state = "idle"; lastError = ""
        getStatus()
    }

    private suspend fun ensureReady() {
        if (client != null && model != null) { state = "ready"; return }
        // x86 emulators advertise secondary ARM ABIs via libndk_translation,
        // which aborts inside Foxlet NEON inference. Require native ARM64.
        check(Build.VERSION.SDK_INT >= 28 && Process.is64Bit() && Build.SUPPORTED_ABIS.firstOrNull() == "arm64-v8a") { "UNSUPPORTED_DEVICE" }
        state = "copying"; lastError = ""
        val bundled = BundledModels(context)
        val directory = bundled.install()
        state = "initializing"
        val opened = Foxlet.create(context) {
            translation { threading = Threading.Fixed(1); retention = ModelRetention.Idle(300.seconds) }
        }
        try {
            val external = ExternalModel(LanguagePair("en", "zh-Hans"),
                ModelFiles.fromDirectory(directory).copy(expectedSha256 = bundled.specs.associate { it.name to it.sha256 }))
            // Warm native model and validate tensors before publishing ready. Real inference.
            opened.translator.translate("Hello.", external)
            client = opened; model = external; initCount++; state = "ready"
        } catch (error: Throwable) { opened.shutdown(); throw error }
    }

    private suspend fun closeClient() { client?.shutdown(); client = null; model = null }

    private fun submit(id: String, callback: FoxletCallback, control: Boolean = false, operation: suspend () -> String) {
        if (pending.incrementAndGet() > 8 && !control) {
            pending.decrementAndGet()
            main.post { callback.onError(id, "BUSY", "翻译请求较多，请稍后重试") }
            return
        }
        scope.launch {
            try {
                val result = gate.withLock { operation() }
                main.post { callback.onSuccess(id, result) }
            } catch (error: Throwable) {
                val code = when {
                    error is OutOfMemoryError -> "LOW_MEMORY"
                    error is ModelIntegrityException || error.message == "MODEL_CORRUPT" -> "MODEL_CORRUPT"
                    error.message == "UNSUPPORTED_DEVICE" || error is UnsatisfiedLinkError -> "UNSUPPORTED_DEVICE"
                    error.message == "STORAGE_FULL" -> "STORAGE_FULL"
                    error.message == "TEXT_LIMIT" -> "TEXT_LIMIT"
                    error is java.io.FileNotFoundException -> "MODEL_MISSING"
                    error is java.io.IOException -> "MODEL_STORAGE"
                    else -> "TRANSLATION_FAILED"
                }
                if (client == null) state = "error"
                lastError = code
                // No source text in logs, errors, network or persistent caches.
                main.post { callback.onError(id, code, errorMessage(code)) }
            } finally { pending.decrementAndGet() }
        }
    }

    override fun onTrimMemory(level: Int) {
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) scope.launch {
            gate.withLock {
                try { client?.translator?.unloadModels() }
                catch (_: Exception) { lastError = "LOW_MEMORY" }
            }
        }
    }
    override fun onLowMemory() = onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_COMPLETE)
    override fun onConfigurationChanged(configuration: Configuration) = Unit

    companion object {
        @Volatile private var instance: FoxletBridge? = null
        @JvmStatic fun getInstance(context: Context): FoxletBridge = instance ?: synchronized(this) {
            instance ?: FoxletBridge(context.applicationContext).also { instance = it }
        }
        private fun errorMessage(code: String) = when (code) {
            "UNSUPPORTED_DEVICE" -> "离线翻译需要 Android 9 及以上的 ARM64 应用"
            "LOW_MEMORY" -> "设备内存不足，请关闭其他应用后重试"
            "STORAGE_FULL" -> "存储空间不足，请释放至少 60 MB 后重试"
            "MODEL_MISSING" -> "安装包缺少离线模型，请安装包含模型的版本"
            "MODEL_CORRUPT" -> "离线模型校验失败，请重新安装完整安装包"
            "MODEL_STORAGE" -> "无法读取离线模型，请检查存储空间后重试"
            "TEXT_LIMIT" -> "请选择 1–4000 字符的文本"
            else -> "离线翻译未完成，请重试"
        }
    }
}
