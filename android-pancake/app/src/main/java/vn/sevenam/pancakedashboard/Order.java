package vn.sevenam.pancakedashboard;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * One Pancake order exactly as the backend / encrypted snapshot sends it.
 * Field names mirror the web dashboard (vercel-pancake-backend/app.js).
 */
final class Order {
    String orderCode = "";
    String createdDate = "";
    String createdAt = "";
    String salesStaff = "Chưa gán";
    String channel = "Khác";
    String status = "TREO";
    String sourceName = "";
    String pageId = "";
    String pageName = "";
    String pageUsername = "";
    String returnedReasonName = "";
    int statusCode = -1;

    /** Nullable: the web treats "missing" differently from a valid zero. */
    Double netAmount;
    Double totalAmount;
    Double grossAmount;
    Double returnedAmount;

    double codAmount;
    double prepaidAmount;
    double successfulAmount;

    boolean isPartialReturn;
    boolean excludedStatus;
    boolean excludedExchangeSource;
    boolean excludedCskhSource;
    boolean excludedFromDefaultReport;
    boolean partialReturnProductDetailMissing;

    final List<ProductLine> products = new ArrayList<>();

    static Order fromJson(JSONObject o) {
        Order x = new Order();
        x.orderCode = str(o, "orderCode");
        x.createdDate = str(o, "createdDate");
        x.createdAt = str(o, "createdAt");
        x.salesStaff = fallback(str(o, "salesStaff"), "Chưa gán");
        x.channel = fallback(str(o, "channel"), "Khác");
        x.status = fallback(str(o, "status"), "TREO");
        x.sourceName = str(o, "sourceName");
        x.pageId = str(o, "pageId");
        x.pageName = str(o, "pageName");
        x.pageUsername = str(o, "pageUsername");
        x.returnedReasonName = str(o, "returnedReasonName");
        x.statusCode = o.optInt("statusCode", -1);

        x.netAmount = num(o, "netAmount");
        x.totalAmount = num(o, "totalAmount");
        x.grossAmount = num(o, "grossAmount");
        x.returnedAmount = num(o, "returnedAmount");
        x.codAmount = zero(num(o, "codAmount"));
        x.prepaidAmount = zero(num(o, "prepaidAmount"));
        x.successfulAmount = zero(num(o, "successfulAmount"));

        x.isPartialReturn = o.optBoolean("isPartialReturn", false);
        x.excludedStatus = o.optBoolean("excludedStatus", false);
        x.excludedExchangeSource = o.optBoolean("excludedExchangeSource", false);
        x.excludedCskhSource = o.optBoolean("excludedCskhSource", false);
        x.excludedFromDefaultReport = o.optBoolean("excludedFromDefaultReport", false);
        x.partialReturnProductDetailMissing = o.optBoolean("partialReturnProductDetailMissing", false);

        JSONArray items = o.optJSONArray("products");
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item != null) x.products.add(ProductLine.fromJson(item));
            }
        }
        return x;
    }

    private static String str(JSONObject o, String key) {
        if (!o.has(key) || o.isNull(key)) return "";
        return String.valueOf(o.opt(key)).trim();
    }

    private static String fallback(String value, String def) {
        return value == null || value.isEmpty() ? def : value;
    }

    static Double num(JSONObject o, String key) {
        if (!o.has(key) || o.isNull(key)) return null;
        Object v = o.opt(key);
        if (v instanceof Number) {
            double d = ((Number) v).doubleValue();
            return Double.isNaN(d) || Double.isInfinite(d) ? null : d;
        }
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return null;
        try {
            double d = Double.parseDouble(s);
            return Double.isNaN(d) || Double.isInfinite(d) ? null : d;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static double zero(Double v) {
        return v == null ? 0 : v;
    }
}
