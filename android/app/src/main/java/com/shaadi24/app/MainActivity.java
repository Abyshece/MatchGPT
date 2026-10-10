package com.shaadi24.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins, before Capacitor starts
        registerPlugin(AppWindowPlugin.class);
        super.onCreate(savedInstanceState);
        // Members' photos, profiles and chats can't be screenshotted or
        // screen-recorded, and the app shows blank in the list of recent apps
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
