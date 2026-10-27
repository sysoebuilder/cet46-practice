package com.hexun.cet.host;

import android.webkit.WebView;
import io.dcloud.application.DCloudApplication;

public final class CetApplication extends DCloudApplication {
    @Override public void onCreate() {
        super.onCreate();
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    }
}
