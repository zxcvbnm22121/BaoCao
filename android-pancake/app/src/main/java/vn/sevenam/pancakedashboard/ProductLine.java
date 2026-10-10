package vn.sevenam.pancakedashboard;

import org.json.JSONObject;

/** One product line inside a Pancake order. */
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
        x.sku = o.optString("sku", "").trim();
        x.productCode = o.optString("productCode", "").trim();
        x.displayCode = o.optString("displayCode", "").trim();
        x.name = o.optString("name", "").trim();
        x.imageUrl = o.optString("imageUrl", "").trim();
        x.productId = o.optString("productId", "").trim();
        x.variationId = o.optString("variationId", "").trim();
        Double qty = Order.num(o, "quantity");
        Double ret = Order.num(o, "returnedQuantity");
        x.quantity = Math.max(0, qty == null ? 0 : qty);
        x.returnedQuantity = Math.max(0, ret == null ? 0 : ret);
        return x;
    }
}
