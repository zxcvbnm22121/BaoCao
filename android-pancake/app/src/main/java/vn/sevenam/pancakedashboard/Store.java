package vn.sevenam.pancakedashboard;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/**
 * Device-local settings, keyed exactly like the web's localStorage:
 *  - channel targets (Ads / Live / Zalo) per month
 *  - Data per channel for the selected "from|to|channel"
 *  - "Data mới toàn kênh" for the quick report per "from|to"
 */
final class Store implements Targets {
    private static final String PREFS = "sevenam_native_dashboard_v3";
    private static final String K_CONFIGURED = "kpi_channel_targets_configured";
    private static final String K_CHANNEL_DATA = "channel_data_v3";
    private static final String K_QUICK_TOTAL = "quick_total_data_v1";

    private final SharedPreferences prefs;
    /** Monthly target sent by the payload, used only when no channel targets are set. */
    double payloadMonthly = Metrics.DEFAULT_MONTHLY;

    @Override
    public double payloadMonthly() {
        return payloadMonthly;
    }

    Store(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        migrateFromV2(context);
    }

    /** One-time copy of targets and typed Data from the previous app version (2.x). */
    private void migrateFromV2(Context context) {
        if (prefs.getBoolean("migrated_from_v2", false)) return;
        try {
            SharedPreferences old = context.getSharedPreferences("sevenam_native_dashboard", Context.MODE_PRIVATE);
            float ads = old.getFloat("targetAds", 0), live = old.getFloat("targetLive", 0), zalo = old.getFloat("targetZalo", 0);
            if (!targetsConfigured() && (old.getBoolean("channelTargetsConfigured", false) || ads + live + zalo > 0)) {
                saveTargets(ads, live, zalo);
            }
            JSONObject data = readMap(K_CHANNEL_DATA);
            JSONObject quick = readMap(K_QUICK_TOTAL);
            for (java.util.Map.Entry<String, ?> e : old.getAll().entrySet()) {
                if (!(e.getValue() instanceof Float)) continue;
                float v = (Float) e.getValue();
                if (v <= 0) continue;
                String k = e.getKey();
                if (k.startsWith("data|")) data.put(k.substring(5), (double) v);
                else if (k.startsWith("quick|")) quick.put(k.substring(6), (double) v);
            }
            prefs.edit().putString(K_CHANNEL_DATA, data.toString()).putString(K_QUICK_TOTAL, quick.toString()).apply();
        } catch (Exception ignored) {
            // Old settings are a convenience only; never block the app on them.
        }
        prefs.edit().putBoolean("migrated_from_v2", true).apply();
    }

    @Override
    public boolean targetsConfigured() {
        return prefs.getBoolean(K_CONFIGURED, false);
    }

    /** key is ads / live / zalo. */
    @Override
    public double target(String key) {
        try {
            return Math.max(0, Double.parseDouble(prefs.getString("target_" + key, "0")));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    void saveTargets(double ads, double live, double zalo) {
        prefs.edit()
                .putString("target_ads", String.valueOf(Math.max(0, ads)))
                .putString("target_live", String.valueOf(Math.max(0, live)))
                .putString("target_zalo", String.valueOf(Math.max(0, zalo)))
                .putBoolean(K_CONFIGURED, true)
                .apply();
    }

    @Override
    public double channelData(String from, String to, String channel) {
        return readMap(K_CHANNEL_DATA).optDouble(from + "|" + to + "|" + channel, 0);
    }

    void setChannelData(String from, String to, String channel, double value) {
        writeValue(K_CHANNEL_DATA, from + "|" + to + "|" + channel, value);
    }

    double quickTotal(String from, String to) {
        return readMap(K_QUICK_TOTAL).optDouble(from + "|" + to, 0);
    }

    void setQuickTotal(String from, String to, double value) {
        writeValue(K_QUICK_TOTAL, from + "|" + to, value);
    }

    private JSONObject readMap(String key) {
        try {
            return new JSONObject(prefs.getString(key, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private void writeValue(String mapKey, String key, double value) {
        JSONObject map = readMap(mapKey);
        try {
            if (value > 0) map.put(key, value);
            else map.remove(key);
        } catch (Exception ignored) {
            return;
        }
        prefs.edit().putString(mapKey, map.toString()).apply();
    }
}
