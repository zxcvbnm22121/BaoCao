package vn.sevenam.pancakedashboard;

import org.json.JSONObject;

final class ProductLine {
    String sku = "";
    String productCode = "";
    String displayCode = "";
    String name = "";
    String imageUrl = "";
    String productId = "";
    String variationId = "";
    double quantity;
    double returnedQuantity;

    static ProductLine fromJson(JSONObject o) {
        ProductLine x = new ProductLine();
        x.sku = o.optString("sku", "");
        x.productCode = o.optString("productCode", "");
        x.displayCode = o.optString("displayCode", "");
        x.name = o.optString("name", "");
        x.imageUrl = o.optString("imageUrl", "");
        x.productId = o.optString("productId", "");
        x.variationId = o.optString("variationId", "");
        x.quantity = Math.max(0, o.optDouble("quantity", 0));
        x.returnedQuantity = Math.max(0, o.optDouble("returnedQuantity", 0));
        return x;
    }

    String canonicalCode() {
        String[] candidates = {displayCode, productCode, sku, name};
        for (String candidate : candidates) {
            String code = normalizeSevenCode(candidate);
            if (!code.isEmpty()) return code;
        }
        return "";
    }

    private static String normalizeSevenCode(String raw) {
        if (raw == null) return "";
        String s = raw.trim().toUpperCase().replaceAll("\\s+", "");
        if (s.matches("^[A-Z]\\d{6}[A-Z][1-5]$")) return s.substring(0, s.length() - 1);
        if (s.matches("^[A-Z]\\d{6}[A-Z]$") || s.matches("^[A-Z]\\d{6}$")) return s;

        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("([A-Z]\\d{6}[A-Z])[1-5]?")
                .matcher(s);
        if (m.find()) return m.group(1);

        m = java.util.regex.Pattern.compile("([A-Z]\\d{6})").matcher(s);
        return m.find() ? m.group(1) : "";
    }
}
