package vn.sevenam.pancakedashboard;

/** Report filters, same five controls as the web filter bar. */
final class Filters {
    String from = "";
    String to = "";
    String channel = Metrics.ALL;
    String staff = Metrics.ALL;
    String status = Metrics.ALL;

    boolean hasDimensionFilter() {
        return !Metrics.ALL.equals(channel) || !Metrics.ALL.equals(staff) || !Metrics.ALL.equals(status);
    }

    String label() {
        StringBuilder sb = new StringBuilder();
        if (!Metrics.ALL.equals(channel)) sb.append(Metrics.channelLabel(channel));
        if (!Metrics.ALL.equals(staff)) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(staff);
        }
        if (!Metrics.ALL.equals(status)) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(Metrics.statusLabel(status));
        }
        return sb.length() == 0 ? "Tất cả kênh · Sale · trạng thái" : sb.toString();
    }
}
