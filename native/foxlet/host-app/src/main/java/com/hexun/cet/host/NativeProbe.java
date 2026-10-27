package com.hexun.cet.host;

import android.os.Handler;
import android.os.Looper;

/** Interoperability probe using only our own class, never SDK decompilation. */
public final class NativeProbe {
    public interface Callback { void onComplete(String id, String result); }
    public static String echo(String text) { return "native:" + text; }
    public static void echoAsync(String id, Callback callback) {
        new Thread(() -> {
            boolean workerIsMain = Looper.myLooper() == Looper.getMainLooper();
            new Handler(Looper.getMainLooper()).post(() -> callback.onComplete(id,
                "{\"workerMain\":" + workerIsMain + ",\"callbackMain\":" + (Looper.myLooper() == Looper.getMainLooper()) + "}"));
        }, "cet-native-probe").start();
    }
}
