package com.minerx.telemetry;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public boolean enterPiP() {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            runOnUiThread(() -> {
                                try {
                                    PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                                    builder.setAspectRatio(new Rational(16, 9));
                                    enterPictureInPictureMode(builder.build());
                                } catch (Exception e) {
                                    e.printStackTrace();
                                }
                            });
                            return true;
                        }
                        return false;
                    }

                    @JavascriptInterface
                    public boolean isPiPSupported() {
                        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O;
                    }
                }, "AndroidPiP");
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                builder.setAspectRatio(new Rational(16, 9));
                enterPictureInPictureMode(builder.build());
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('pipmodechange', { detail: { isPiP: " + isInPictureInPictureMode + " } }));",
                    null
                );
            }
        } catch (Exception ignored) {}
    }
}
