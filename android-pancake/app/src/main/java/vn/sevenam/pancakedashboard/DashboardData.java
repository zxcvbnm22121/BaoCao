package vn.sevenam.pancakedashboard;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

final class DashboardData {
    String source = "PANCAKE";
    String lastUpdated = "";
    double monthlyTarget = 2_300_000_000d;
    final List<Order> orders = new ArrayList<>();

    static DashboardData fromJson(JSONObject root) {
        DashboardData data = new DashboardData();
        JSONObject meta = root.optJSONObject("meta");
        if (meta != null) {
            data.source = meta.optString("source", "PANCAKE");
            data.lastUpdated = meta.optString("lastUpdated", "");
        }
        data.monthlyTarget = root.optDouble("monthlyTarget", data.monthlyTarget);
        JSONArray arr = root.optJSONArray("orders");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject row = arr.optJSONObject(i);
                if (row != null) data.orders.add(Order.fromJson(row));
            }
        }
        return data;
    }
}
