package com.matchgpt.app;

import android.graphics.Color;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Colours the strips behind the status bar and the gesture bar to match the
 * app's light or dark theme, with dark or light icons on them.
 *
 * Capacitor keeps the page clear of those bars; what shows behind them is the
 * window's own background, which this sets. Called from lib/nativeApp.ts
 * (setNativeTheme) whenever the app's theme changes.
 */
@CapacitorPlugin(name = "AppWindow")
public class AppWindowPlugin extends Plugin {

    @PluginMethod
    public void setTheme(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        String color = call.getString("color", dark ? "#191919" : "#ffffff");
        int background;
        try {
            background = Color.parseColor(color);
        } catch (IllegalArgumentException e) {
            call.reject("Not a colour: " + color);
            return;
        }

        getBridge().executeOnMainThread(() -> {
            Window window = getActivity().getWindow();
            window.getDecorView().setBackgroundColor(background);
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
            bars.setAppearanceLightStatusBars(!dark);
            bars.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }
}
