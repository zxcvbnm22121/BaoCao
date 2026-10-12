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

    /** Indexes into a POS-reconciliation row (meta.posReconciliation). */
    static final int P_POS_ORDERS = 0, P_POS_NET = 1, P_CANCELLED_ORDERS = 2, P_CANCELLED_NET = 3,
            P_UNTRACKED_ORDERS = 4, P_UNTRACKED_NET = 5;

    String source = "PANCAKE";
    String transport = "";
    String lastUpdated = "";
    String from = "";
    String to = "";
    double monthlyTarget = Metrics.DEFAULT_MONTHLY;
    final List<Order> orders = new ArrayList<>();
    /** day -> {orders, net, cod, prepaid, gross}; empty when the payload has none. */
    final Map<String, double[]> dayReconciliation = new LinkedHashMap<>();
    /** day -> {posOrders, posNet, cancelledOrders, cancelledNet, untrackedOrders, untrackedNet}; null when the payload has none. */
    Map<String, double[]> posReconciliation = null;

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
            JSONObject pos = meta.optJSONObject("posReconciliation");
            if (pos != null) {
                data.posReconciliation = new LinkedHashMap<>();
                Iterator<String> keys = pos.keys();
                while (keys.hasNext()) {
                    String day = keys.next();
                    JSONObject r = pos.optJSONObject(day);
                    if (r == null) continue;
                    data.posReconciliation.put(day, new double[]{
                            r.optDouble("posOrders", 0), r.optDouble("posNet", 0),
                            r.optDouble("cancelledOrders", 0), r.optDouble("cancelledNet", 0),
                            r.optDouble("untrackedOrders", 0), r.optDouble("untrackedNet", 0)
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
        // Like the web: one chunk without POS data makes the whole range unverifiable.
        out.posReconciliation = new LinkedHashMap<>();
        for (DashboardData p : parts) {
            out.orders.addAll(p.orders);
            out.dayReconciliation.putAll(p.dayReconciliation);
            if (out.posReconciliation != null && p.posReconciliation != null) {
                out.posReconciliation.putAll(p.posReconciliation);
            } else {
                out.posReconciliation = null;
            }
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
