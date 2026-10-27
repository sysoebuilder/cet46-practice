package com.hexun.cet.foxlet.smoke

import android.app.Activity
import android.os.Bundle
import android.widget.*
import com.hexun.cet.foxlet.FoxletBridge
import com.hexun.cet.foxlet.FoxletCallback

/** Separate test package. Never replaces the user's study app or progress. */
class SmokeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(24, 48, 24, 24) }
        val input = EditText(this).apply { setText("Hello world. Learning English opens new doors.") }
        val output = TextView(this).apply { text = "无网络权限的真实推理验证；此包不是 5+ 业务 App。"; setTextIsSelectable(true) }
        val bridge = FoxletBridge.getInstance(applicationContext)
        val callback = object : FoxletCallback {
            override fun onSuccess(requestId: String, result: String) { output.text = "$requestId\n$result\n${bridge.getStatus()}" }
            override fun onError(requestId: String, code: String, message: String) { output.text = "$requestId\n$code\n$message" }
        }
        val initialize = Button(this).apply { text = "初始化"; setOnClickListener { output.text = "正在校验模型…"; bridge.init("init", callback) } }
        val translate = Button(this).apply { text = "离线翻译"; setOnClickListener { output.text = "正在翻译…"; bridge.translate(input.text.toString(), "translation", callback) } }
        val release = Button(this).apply { text = "释放模型"; setOnClickListener { bridge.destroy("destroy", callback) } }
        root.addView(input); root.addView(initialize); root.addView(translate); root.addView(release); root.addView(output)
        setContentView(root)
    }
}
