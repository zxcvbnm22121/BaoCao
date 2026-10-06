package vn.sevenam.pancakedashboard;

import org.json.JSONObject;

final class Order {
    String createdDate = "";
    String createdAt = "";
    String salesStaff = "Chưa gán";
    String channel = "Khác";
    String status = "TREO";
    String sourceName = "";
    int statusCode = -1;
    double grossAmount;
    double netAmount;
    double discountAmount;
    double codAmount;
    double prepaidAmount;
    double totalAmount;
    double successfulAmount;
    boolean excludedStatus;
    boolean excludedExchangeSource;
    boolean excludedFromDefaultReport;

    static Order fromJson(JSONObject o) {
        Order x = new Order();
        x.createdDate = o.optString("createdDate", "");
        x.createdAt = o.optString("createdAt", "");
        x.salesStaff = blankFallback(o.optString("salesStaff", ""), "Chưa gán");
        x.channel = blankFallback(o.optString("channel", ""), "Khác");
        x.status = blankFallback(o.optString("status", ""), "TREO");
        x.sourceName = o.optString("sourceName", "");
        x.statusCode = o.optInt("statusCode", -1);
        x.grossAmount = o.optDouble("grossAmount", o.optDouble("totalAmount", 0));
        x.netAmount = o.optDouble("netAmount", o.optDouble("totalAmount", 0));
        x.discountAmount = o.optDouble("discountAmount", Math.max(0, x.grossAmount - x.netAmount));
        x.codAmount = o.optDouble("codAmount", 0);
        x.prepaidAmount = o.optDouble("prepaidAmount", 0);
        x.totalAmount = o.optDouble("totalAmount", x.netAmount);
        x.successfulAmount = o.optDouble("successfulAmount", 0);
        x.excludedStatus = o.optBoolean("excludedStatus", false);
        x.excludedExchangeSource = o.optBoolean("excludedExchangeSource", false);
        x.excludedFromDefaultReport = o.optBoolean(
                "excludedFromDefaultReport",
                x.excludedStatus || x.excludedExchangeSource
        );
        return x;
    }

    private static String blankFallback(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
}
