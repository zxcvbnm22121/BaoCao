package vn.sevenam.pancakedashboard;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A Pancake payload: orders plus the meta block the web uses for coverage and reconciliation. */
final class DashboardData {
    /** Indexes into a day-reconciliation row. */
    static final int R_ORDERS = 0, R_NET = 1, R_COD = 2, R_PREPAID = 3, R_GROSS = 4;

    String source = "PANCAKE";
    String transport = "";
    String lastUpdated = "";
    String from = "";
    String to = "";
    double monthlyTarget = Metrics.DEFAULT_MONTHLY;
    final List<Order> orders = new ArrayList<>();
    /** day -> {orders, net, cod, prepaid, gross}; empty when the payload has none. */
    final Map<String, double[]> dayReconciliation = new LinkedHashMap<>();

    static DashboardData fromJson(JSONObject root) {
        JSONArray arr = root.optJSONArray("orders");
        if (arr == null) throw new IllegalStateException("Bản dữ liệu Pancake không hợp lệ");
        DashboardData data = new DashboardData();
        JSONObject meta = root.optJSONObject("meta");
        if (meta != null) {
            data.source = meta.optString("source", "PANCAKE");
            data.transport = meta.optString("transport", "");
            data.lastUpdated = meta.optString("lastUpdated", "");
            data.from = meta.optString("from", "");
            data.to = meta.optString("to", "");
            JSONObject rec = meta.optJSONObject("dayReconciliation");
            if (rec != null) {
                Iterator<String> keys = rec.keys();
                while (keys.hasNext()) {
                    String day = keys.next();
                    JSONObject r = rec.optJSONObject(day);
                    if (r == null) continue;
                    data.dayReconciliation.put(day, new double[]{
                            r.optDouble("orders", 0), r.optDouble("net", 0), r.optDouble("cod", 0),
                            r.optDouble("prepaid", 0), r.optDouble("gross", 0)
                    });
                }
            }
        }
        Double target = Order.num(root, "monthlyTarget");
        if (target != null && target > 0) data.monthlyTarget = target;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject row = arr.optJSONObject(i);
            if (row != null) data.orders.add(Order.fromJson(row));
        }
        return data;
    }

    /** Same as combineRangePayloads() on the web: one payload per calendar month. */
    static DashboardData combine(List<DashboardData> parts, String from, String to) {
        DashboardData out = new DashboardData();
        out.source = "PANCAKE";
        out.transport = "VERCEL_DIRECT";
        out.from = from;
        out.to = to;
        for (DashboardData p : parts) {
            out.orders.addAll(p.orders);
            out.dayReconciliation.putAll(p.dayReconciliation);
        }
        if (!parts.isEmpty()) {
            DashboardData latest = parts.get(parts.size() - 1);
            out.monthlyTarget = latest.monthlyTarget;
            out.lastUpdated = latest.lastUpdated;
        }
        if (out.lastUpdated == null || out.lastUpdated.isEmpty()) {
            out.lastUpdated = java.time.Instant.now().toString();
        }
        return out;
    }
}
