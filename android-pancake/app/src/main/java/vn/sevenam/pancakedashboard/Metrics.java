package vn.sevenam.pancakedashboard;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Business rules ported one-to-one from the web dashboard
 * (vercel-pancake-backend/app.js) so the app and the website always show the same numbers.
 */
final class Metrics {
    static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");
    static final String ALL = "Tất cả";
    static final String CH_ADS = "Facebook Ads";
    static final String CH_LIVE = "Livestream";
    static final String CH_ZALO = "Zalo";
    static final String[] KPI_CHANNELS = {CH_ADS, CH_LIVE, CH_ZALO};
    static final String[] KPI_KEYS = {"ads", "live", "zalo"};
    static final String[] KPI_LABELS = {"Ads", "Live", "Zalo"};
    static final String[] STATUS_KEYS = {"TREO", "DANG_GIAO", "THANH_CONG", "HOAN", "HUY"};
    static final double DEFAULT_MONTHLY = 2_300_000_000d;
    static final String NO_PAGE = "Chưa xác định Page";
    static final String NO_REASON = "Chưa ghi lý do";

    private static final Pattern CSKH = Pattern.compile("^\\s*cskh\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern EXCHANGE = Pattern.compile(
            "^\\s*(đơn|don)\\s+đổi\\b", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern LIVE_SOURCE = Pattern.compile("(?:^|[^a-z0-9])live", Pattern.CASE_INSENSITIVE);
    private static final Pattern ISO_DAY = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    // ------------------------------------------------------------------ labels

    static String statusLabel(String s) {
        if ("TREO".equals(s)) return "Treo";
        if ("DANG_GIAO".equals(s)) return "Đang giao";
        if ("THANH_CONG".equals(s)) return "Thành công";
        if ("HOAN".equals(s)) return "Hoàn";
        if ("HUY".equals(s)) return "Huỷ / xoá";
        return s == null || s.isEmpty() ? "—" : s;
    }

    static int statusColor(String s) {
        if ("TREO".equals(s)) return Ui.ST_TREO;
        if ("DANG_GIAO".equals(s)) return Ui.ST_SHIP;
        if ("THANH_CONG".equals(s)) return Ui.ST_SUCCESS;
        if ("HOAN".equals(s)) return Ui.ST_RETURN;
        return Ui.ST_CANCEL;
    }

    static boolean isKpiChannel(String channel) {
        for (String c : KPI_CHANNELS) if (c.equals(channel)) return true;
        return false;
    }

    static String channelKey(String channel) {
        for (int i = 0; i < KPI_CHANNELS.length; i++) if (KPI_CHANNELS[i].equals(channel)) return KPI_KEYS[i];
        return null;
    }

    static String channelLabel(String channel) {
        for (int i = 0; i < KPI_CHANNELS.length; i++) if (KPI_CHANNELS[i].equals(channel)) return KPI_LABELS[i];
        return channel;
    }

    static int channelColor(String channel) {
        if (CH_ADS.equals(channel)) return Ui.CH_ADS;
        if (CH_LIVE.equals(channel)) return Ui.CH_LIVE;
        if (CH_ZALO.equals(channel)) return Ui.CH_ZALO;
        return Ui.ON_VARIANT;
    }

    // ------------------------------------------------------------------- dates

    static String today() {
        return LocalDate.now(VN).toString();
    }

    static String shiftDay(String iso, int offset) {
        try {
            return LocalDate.parse(iso).plusDays(offset).toString();
        } catch (Exception e) {
            return LocalDate.now(VN).plusDays(offset).toString();
        }
    }

    static String monthStart(String iso) {
        return iso.substring(0, 7) + "-01";
    }

    static boolean isIsoDay(String s) {
        return s != null && ISO_DAY.matcher(s).matches();
    }

    static Instant parseInstant(String s) {
        if (s == null || s.isEmpty()) return null;
        try {
            return Instant.parse(s);
        } catch (Exception ignored) {
        }
        try {
            return OffsetDateTime.parse(s).toInstant();
        } catch (Exception ignored) {
        }
        try {
            return LocalDateTime.parse(s).atZone(VN).toInstant();
        } catch (Exception ignored) {
        }
        return null;
    }

    static String orderDate(Order o) {
        if (isIsoDay(o.createdDate)) return o.createdDate;
        Instant t = parseInstant(o.createdAt);
        return t == null ? "" : t.atZone(VN).toLocalDate().toString();
    }

    static int orderHour(Order o) {
        Instant t = parseInstant(o.createdAt);
        return t == null ? -1 : t.atZone(VN).getHour();
    }

    /** Every calendar day in [from, to]; empty when the range is invalid or over a year. */
    static List<String> days(String from, String to) {
        List<String> out = new ArrayList<>();
        if (!isIsoDay(from) || !isIsoDay(to)) return out;
        try {
            LocalDate a = LocalDate.parse(from);
            LocalDate b = LocalDate.parse(to);
            if (a.isAfter(b) || ChronoUnit.DAYS.between(a, b) > 366) return out;
            for (LocalDate d = a; !d.isAfter(b); d = d.plusDays(1)) out.add(d.toString());
        } catch (Exception ignored) {
        }
        return out;
    }

    static int daysInMonth(String month) {
        try {
            return YearMonth.parse(month).lengthOfMonth();
        } catch (Exception e) {
            return 30;
        }
    }

    private static double dayFraction() {
        LocalTime now = LocalTime.now(VN);
        return (now.getHour() * 60 + now.getMinute()) / 1440.0;
    }

    /** Share of the selected period already elapsed (reportTimeProgress on the web). */
    static double timeProgress(List<String> days) {
        if (days.isEmpty()) return 0;
        String today = today();
        double frac = dayFraction();
        double sum = 0;
        for (String d : days) {
            int c = d.compareTo(today);
            if (c < 0) sum += 1;
            else if (c == 0) sum += frac;
        }
        return sum / days.size();
    }

    static double remainingDayUnits(List<String> days) {
        String today = today();
        double frac = dayFraction();
        double sum = 0;
        for (String d : days) {
            int c = d.compareTo(today);
            if (c > 0) sum += 1;
            else if (c == 0) sum += 1 - frac;
        }
        return sum;
    }

    static String shortDay(String iso) {
        if (!isIsoDay(iso)) return iso == null ? "" : iso;
        return iso.substring(8, 10) + "/" + iso.substring(5, 7);
    }

    // ------------------------------------------------------- order classifiers

    static boolean isCskh(Order o) {
        return o.excludedCskhSource || CSKH.matcher(o.sourceName).find();
    }

    static boolean isExchange(Order o) {
        return o.excludedExchangeSource || EXCHANGE.matcher(o.sourceName).find();
    }

    static boolean isLiveSource(Order o) {
        return CH_LIVE.equals(o.channel) || LIVE_SOURCE.matcher(o.sourceName).find();
    }

    /** Cancelled, exchange (Đơn đổi) and CSKH orders are hidden from the default report. */
    static boolean isDefaultExcluded(Order o) {
        return o.excludedFromDefaultReport || o.excludedExchangeSource || isCskh(o) || o.excludedStatus;
    }

    static boolean matchesStatus(Order o, String status) {
        if (ALL.equals(status)) return !isDefaultExcluded(o);
        return status.equals(o.status) && !isExchange(o) && !isCskh(o);
    }

    static boolean isPageRelevant(Order o) {
        return !(o.pageName + o.pageUsername + o.pageId).trim().isEmpty()
                || CH_ADS.equals(o.channel) || CH_LIVE.equals(o.channel);
    }

    static boolean isPageRevenue(Order o) {
        return isPageRelevant(o) && !isExchange(o) && !isLiveSource(o);
    }

    static String pageLabel(Order o) {
        if (!o.pageName.isEmpty()) return o.pageName;
        if (!o.pageUsername.isEmpty()) return o.pageUsername.replaceFirst("^@", "");
        if (!o.pageId.isEmpty()) return "Page " + o.pageId;
        return NO_PAGE;
    }

    static String pageKey(Order o) {
        if (!o.pageId.isEmpty()) return "id:" + o.pageId;
        return "name:" + pageLabel(o).toLowerCase(Locale.ROOT);
    }

    static String returnReason(Order o) {
        return o.returnedReasonName.isEmpty() ? NO_REASON : o.returnedReasonName;
    }

    static String staffOf(Order o) {
        return o.salesStaff == null || o.salesStaff.isEmpty() ? "Chưa gán" : o.salesStaff;
    }

    // ------------------------------------------------------------------ money

    /** Pancake after-discount total; a valid zero is kept (orderRevenue on the web). */
    static double revenue(Order o) {
        if (o.netAmount != null) return o.netAmount;
        if (o.totalAmount != null) return o.totalAmount;
        double payment = o.codAmount + o.prepaidAmount;
        if (payment != 0) return payment;
        return o.grossAmount == null ? 0 : o.grossAmount;
    }

    static double gross(Order o) {
        if (o.grossAmount != null) return o.grossAmount;
        return o.totalAmount == null ? 0 : o.totalAmount;
    }

    static double successful(Order o) {
        if ("THANH_CONG".equals(o.status)) return revenue(o);
        return o.successfulAmount; // kept part of a partial return
    }

    static boolean isSuccessfulOrder(Order o) {
        return successful(o) > 0 || "THANH_CONG".equals(o.status);
    }

    /** Whole order for a full return, only the returned items for a partial return. */
    static double returned(Order o) {
        if (!"HOAN".equals(o.status)) return 0;
        if (o.returnedAmount != null) return o.returnedAmount;
        return o.isPartialReturn ? Math.max(0, revenue(o) - successful(o)) : revenue(o);
    }

    static double sumRevenue(List<Order> rows) {
        double s = 0;
        for (Order o : rows) s += revenue(o);
        return s;
    }

    static final class Overview {
        double created, gross, discount, cod, prepaid, success, pending, shipping, returns, cancelled;
        int orders, successOrders, returnOrders, pendingOrders, shippingOrders;
        double returnRate, aov;
    }

    static Overview overview(List<Order> rows) {
        Overview k = new Overview();
        for (Order o : rows) {
            double rev = revenue(o);
            double g = gross(o);
            k.created += rev;
            k.gross += g;
            k.discount += Math.max(0, g - rev);
            k.cod += o.codAmount;
            k.prepaid += o.prepaidAmount;
            k.success += successful(o);
            if (isSuccessfulOrder(o)) k.successOrders++;
            if ("TREO".equals(o.status)) {
                k.pending += rev;
                k.pendingOrders++;
            }
            if ("DANG_GIAO".equals(o.status)) {
                k.shipping += rev;
                k.shippingOrders++;
            }
            if ("HUY".equals(o.status)) k.cancelled += rev;
            if ("HOAN".equals(o.status)) k.returnOrders++;
            k.returns += returned(o);
        }
        k.orders = rows.size();
        k.returnRate = rows.isEmpty() ? 0 : (double) k.returnOrders / rows.size();
        k.aov = rows.isEmpty() ? 0 : k.created / rows.size();
        return k;
    }

    static <K> Map<K, List<Order>> group(List<Order> rows, Function<Order, K> key) {
        Map<K, List<Order>> map = new LinkedHashMap<>();
        for (Order o : rows) {
            K k = key.apply(o);
            List<Order> list = map.get(k);
            if (list == null) {
                list = new ArrayList<>();
                map.put(k, list);
            }
            list.add(o);
        }
        return map;
    }

    static List<Order> where(List<Order> rows, Function<Order, Boolean> keep) {
        List<Order> out = new ArrayList<>();
        for (Order o : rows) if (keep.apply(o)) out.add(o);
        return out;
    }

    // ---------------------------------------------------------------- filters

    static List<Order> filter(List<Order> all, Filters f) {
        List<Order> out = new ArrayList<>();
        for (Order o : all) {
            String d = orderDate(o);
            if (!f.from.isEmpty() && d.compareTo(f.from) < 0) continue;
            if (!f.to.isEmpty() && d.compareTo(f.to) > 0) continue;
            if (!ALL.equals(f.channel) && !f.channel.equals(o.channel)) continue;
            if (!ALL.equals(f.staff) && !f.staff.equals(o.salesStaff)) continue;
            if (!matchesStatus(o, f.status)) continue;
            out.add(o);
        }
        return out;
    }

    /** Orders in the date range, default exclusions applied, any channel (quick report). */
    static List<Order> inRangeDefault(List<Order> all, String from, String to) {
        List<Order> out = new ArrayList<>();
        for (Order o : all) {
            String d = orderDate(o);
            if (d.compareTo(from) >= 0 && d.compareTo(to) <= 0 && !isDefaultExcluded(o)) out.add(o);
        }
        return out;
    }

    static int excludedCount(List<Order> all, Filters f) {
        return excludedRows(all, f).size();
    }

    private static List<Order> excludedRows(List<Order> all, Filters f) {
        List<Order> out = new ArrayList<>();
        for (Order o : all) {
            String d = orderDate(o);
            if (d.compareTo(f.from) >= 0 && d.compareTo(f.to) <= 0
                    && (ALL.equals(f.channel) || f.channel.equals(o.channel))
                    && (ALL.equals(f.staff) || f.staff.equals(o.salesStaff))
                    && isDefaultExcluded(o)) out.add(o);
        }
        return out;
    }

    static List<Order> drillRows(List<Order> all, Filters f, String type, String value) {
        if ("excluded".equals(type)) return excludedRows(all, f);
        List<Order> rows = filter(all, f);
        List<Order> out = new ArrayList<>();
        Set<Integer> codes = new HashSet<>();
        if ("statusCodes".equals(type)) {
            for (String c : value.split(",")) {
                try {
                    codes.add(Integer.parseInt(c.trim()));
                } catch (NumberFormatException ignored) {
                }
            }
        }
        for (Order o : rows) {
            boolean keep;
            switch (type) {
                case "status": keep = value.equals(o.status); break;
                case "statusCodes": keep = codes.contains(o.statusCode); break;
                case "successful": keep = isSuccessfulOrder(o); break;
                case "channel": keep = value.equals(o.channel); break;
                case "page": keep = isPageRevenue(o) && pageKey(o).equals(value); break;
                case "staff": keep = staffOf(o).equals(value); break;
                case "returnReason": keep = "HOAN".equals(o.status) && returnReason(o).equals(value); break;
                default: keep = true;
            }
            if (keep) out.add(o);
        }
        return out;
    }

    static List<String> distinctSorted(List<Order> rows, Function<Order, String> key) {
        TreeSet<String> set = new TreeSet<>();
        for (Order o : rows) {
            String v = key.apply(o);
            if (v != null && !v.isEmpty()) set.add(v);
        }
        return new ArrayList<>(set);
    }

    // ---------------------------------------------------------------- targets

    static boolean targetAvailable(Targets s, String channel) {
        return s.targetsConfigured() && (ALL.equals(channel) || isKpiChannel(channel));
    }

    static double channelTargetMonth(Targets s, String channel) {
        String key = channelKey(channel);
        return key == null ? 0 : Math.max(0, s.target(key));
    }

    static double targetMonth(Targets s, String channel) {
        if (s.targetsConfigured()) {
            if (channel != null && !ALL.equals(channel)) return channelTargetMonth(s, channel);
            double sum = 0;
            for (String c : KPI_CHANNELS) sum += channelTargetMonth(s, c);
            return sum;
        }
        return s.payloadMonthly() > 0 ? s.payloadMonthly() : DEFAULT_MONTHLY;
    }

    static double dailyTarget(Targets s, String month, String channel) {
        return Math.max(0, Math.round(targetMonth(s, channel) / daysInMonth(month)));
    }

    /** With channel targets and "all channels", only Ads + Live + Zalo count toward the target. */
    static List<Order> scopeForTarget(Targets s, List<Order> rows, String channel) {
        if (!s.targetsConfigured() || !ALL.equals(channel)) return rows;
        return where(rows, o -> isKpiChannel(o.channel));
    }

    static final class Pace {
        Overview k;
        double goal, time, expected, completion, gap, gapPts, forecast, needPerDay, remaining;
        double pacing = Double.NaN;

        boolean hasGoal() {
            return goal > 0;
        }

        String level() {
            if (!hasGoal()) return "neutral";
            if (gapPts >= 0) return "good";
            if (gapPts >= -10) return "warn";
            return "bad";
        }

        String text() {
            if (!hasGoal()) return "Chưa có target";
            if (gapPts >= 0) return "Đúng tiến độ";
            if (gapPts >= -10) return "Chậm nhẹ";
            return "Chậm tiến độ";
        }
    }

    static Pace pace(Targets s, List<Order> rows, String channel, List<String> days) {
        Pace p = new Pace();
        p.k = overview(rows);
        p.time = timeProgress(days);
        p.remaining = remainingDayUnits(days);
        double goal = 0;
        if (targetAvailable(s, channel)) {
            for (String d : days) goal += dailyTarget(s, d.substring(0, 7), channel);
        }
        double created = p.k.created;
        p.goal = goal;
        p.expected = goal * p.time;
        p.completion = goal > 0 ? created / goal : 0;
        p.pacing = p.expected > 0 ? created / p.expected : Double.NaN;
        p.gap = p.expected - created;
        p.gapPts = goal > 0 ? (created / goal - p.time) * 100 : 0;
        p.forecast = p.time > 0 ? created / p.time : 0;
        p.needPerDay = p.remaining > 0 ? Math.max(0, goal - created) / p.remaining : 0;
        return p;
    }

    /** Data typed for the selected range (totalManualData on the web). */
    static double totalData(Targets s, Filters f, List<Order> all) {
        if (!ALL.equals(f.channel)) return s.channelData(f.from, f.to, f.channel);
        double sum = 0;
        for (String c : new LinkedHashSet<>(distinctSorted(all, o -> o.channel))) {
            sum += s.channelData(f.from, f.to, c);
        }
        return sum;
    }

    // ----------------------------------------------------------------- alerts

    static final class Alert {
        final String level, title, text;

        Alert(String level, String title, String text) {
            this.level = level;
            this.title = title;
            this.text = text;
        }
    }

    static List<Alert> alerts(Targets s, List<Order> rows, Filters f, List<String> days,
                              String lastUpdated, String transport) {
        List<Alert> list = new ArrayList<>();
        String sel = f.channel;
        Pace overall = pace(s, scopeForTarget(s, rows, sel), sel, days);
        if (overall.hasGoal()) {
            if (overall.gapPts < -10) {
                list.add(new Alert("bad", "Tổng doanh số chậm tiến độ",
                        "Đạt " + Ui.pct(overall.completion) + " target trong khi thời gian đã qua " + Ui.pct(overall.time)
                                + ". Thiếu " + Ui.compact(overall.gap)
                                + (overall.remaining > 0 ? "; cần " + Ui.compact(overall.needPerDay) + "/ngày để về đích" : "") + "."));
            } else if (overall.gapPts < 0) {
                list.add(new Alert("warn", "Hơi chậm so với tiến độ",
                        "Thiếu " + Ui.compact(overall.gap) + " so với mức phải đạt đến giờ (" + Ui.compact(overall.expected) + ")."));
            } else {
                list.add(new Alert("good", "Đang đúng tiến độ",
                        "Vượt " + Ui.compact(-overall.gap) + " so với mức phải đạt đến giờ. Dự báo cuối kỳ "
                                + Ui.compact(overall.forecast) + "."));
            }
        }
        if (ALL.equals(sel)) {
            List<Pace> per = new ArrayList<>();
            List<Integer> idx = new ArrayList<>();
            for (int i = 0; i < KPI_CHANNELS.length; i++) {
                final String ch = KPI_CHANNELS[i];
                Pace p = pace(s, where(rows, o -> ch.equals(o.channel)), ch, days);
                per.add(p);
                idx.add(i);
            }
            List<Integer> slow = new ArrayList<>();
            for (int i = 0; i < per.size(); i++) {
                Pace p = per.get(i);
                if (p.hasGoal() && !Double.isNaN(p.pacing) && p.expected > 0) slow.add(i);
            }
            slow.sort((a, b) -> Double.compare(per.get(a).pacing, per.get(b).pacing));
            for (int i : slow) {
                Pace p = per.get(i);
                if (p.pacing < .9) {
                    list.add(new Alert(p.pacing < .75 ? "bad" : "warn", KPI_LABELS[i] + " thiếu " + Ui.compact(p.gap),
                            "Mới đạt " + Ui.pct(p.pacing) + " mức phải đạt đến giờ của kênh"
                                    + (p.remaining > 0 ? "; cần " + Ui.compact(p.needPerDay) + "/ngày" : "") + "."));
                }
            }
            int best = -1;
            for (int i = 0; i < per.size(); i++) {
                Pace p = per.get(i);
                if (p.hasGoal() && !Double.isNaN(p.pacing) && p.pacing >= 1.1
                        && (best < 0 || p.pacing > per.get(best).pacing)) best = i;
            }
            if (best >= 0) {
                Pace p = per.get(best);
                list.add(new Alert("good", KPI_LABELS[best] + " vượt nhịp",
                        "Đạt " + Ui.pct(p.pacing) + " mức phải đạt đến giờ, vượt " + Ui.compact(-p.gap) + "."));
            }
        }
        Overview k = overview(rows);
        if (k.returnRate > .2) {
            list.add(new Alert("bad", "Tỷ lệ hoàn trên 20%",
                    Ui.pct(k.returnRate) + " · " + Ui.num(k.returnOrders) + " đơn hoàn, giá trị hoàn " + Ui.compact(k.returns) + "."));
        } else {
            for (int i = 0; i < KPI_CHANNELS.length; i++) {
                final String ch = KPI_CHANNELS[i];
                Overview r = overview(where(rows, o -> ch.equals(o.channel)));
                if (r.orders >= 10 && r.returnRate > .2) {
                    list.add(new Alert("warn", "Hoàn cao ở " + KPI_LABELS[i], Ui.pct(r.returnRate) + " đơn hoàn trong kênh."));
                }
            }
        }
        if (k.created > 0 && k.pending / k.created > .25) {
            list.add(new Alert("warn", Ui.num(k.pendingOrders) + " đơn đang treo",
                    "Treo " + Ui.compact(k.pending) + " (" + Ui.pct(k.pending / k.created) + " doanh số). Nên ưu tiên xác nhận."));
        }
        double adsData = s.channelData(f.from, f.to, CH_ADS);
        int adsOrders = where(rows, o -> CH_ADS.equals(o.channel)).size();
        if (adsData > 0 && adsOrders / adsData < .10) {
            list.add(new Alert("bad", "CR Ads dưới 10%",
                    Ui.num(adsOrders) + " đơn / " + Ui.num(adsData) + " data = " + Ui.pct(adsOrders / adsData) + "."));
        }
        String today = today();
        boolean todayOnly = today.equals(f.from) && today.equals(f.to);
        if (todayOnly && (ALL.equals(sel) || CH_LIVE.equals(sel)) && where(rows, o -> CH_LIVE.equals(o.channel)).isEmpty()) {
            list.add(new Alert("warn", "Live chưa có đơn hôm nay", "Chưa ghi nhận đơn nguồn Live trong dữ liệu hôm nay."));
        }
        Instant updated = parseInstant(lastUpdated);
        if (updated != null) {
            long age = ChronoUnit.MINUTES.between(updated, Instant.now());
            if (age >= ("VERCEL_DIRECT".equals(transport) ? 2 : 6)) {
                list.add(new Alert("warn", "Dữ liệu chưa đủ mới", "Lần cập nhật gần nhất " + age + " phút trước."));
            }
        }
        String topName = null;
        double topValue = 0;
        for (Map.Entry<String, List<Order>> e : group(rows, Metrics::staffOf).entrySet()) {
            double v = sumRevenue(e.getValue());
            if (topName == null || v > topValue) {
                topName = e.getKey();
                topValue = v;
            }
        }
        if (topName != null && topValue > 0 && !"Chưa gán".equals(topName)) {
            list.add(new Alert("info", topName + " dẫn đầu Sale",
                    Ui.compact(topValue) + " · " + Ui.pct(k.created > 0 ? topValue / k.created : 0) + " doanh số khoảng lọc."));
        }
        if (list.isEmpty()) {
            list.add(new Alert("info", "Chưa có gì cần chú ý", "Nhập target và Data kênh để dashboard so sánh tiến độ và CR."));
        }
        List<Alert> sorted = new ArrayList<>(list);
        sorted.sort((a, b) -> Integer.compare(rank(a.level), rank(b.level)));
        return sorted;
    }

    private static int rank(String level) {
        switch (level) {
            case "bad": return 0;
            case "warn": return 1;
            case "good": return 2;
            default: return 3;
        }
    }

    // --------------------------------------------------------- reconciliation

    static final class Check {
        final String name, text;
        final boolean ok;

        Check(String name, boolean ok, String text) {
            this.name = name;
            this.ok = ok;
            this.text = text;
        }
    }

    static List<Check> reconciliation(List<Order> rows, Filters f, Map<String, double[]> expected) {
        List<Check> checks = new ArrayList<>();
        Overview k = overview(rows);
        double total = k.created;
        double eps = .01;
        double byChannel = 0, byStaff = 0, byStatus = 0;
        for (List<Order> g : group(rows, o -> o.channel).values()) byChannel += sumRevenue(g);
        for (List<Order> g : group(rows, Metrics::staffOf).values()) byStaff += sumRevenue(g);
        for (List<Order> g : group(rows, o -> o.status).values()) byStatus += sumRevenue(g);
        checks.add(new Check("Tổng theo kênh", Math.abs(byChannel - total) < eps, Ui.money(byChannel)));
        checks.add(new Check("Tổng theo Sale", Math.abs(byStaff - total) < eps, Ui.money(byStaff)));
        checks.add(new Check("Tổng theo trạng thái", Math.abs(byStatus - total) < eps, Ui.money(byStatus)));
        if (!f.hasDimensionFilter() && expected != null && !expected.isEmpty()) {
            double orders = 0, net = 0, cod = 0, prepaid = 0;
            for (String d : days(f.from, f.to)) {
                double[] r = expected.get(d);
                if (r == null) continue;
                orders += r[DashboardData.R_ORDERS];
                net += r[DashboardData.R_NET];
                cod += r[DashboardData.R_COD];
                prepaid += r[DashboardData.R_PREPAID];
            }
            checks.add(new Check("Khớp nguồn API · số đơn", Math.round(orders) == rows.size(),
                    Ui.num(rows.size()) + " / " + Ui.num(orders) + " đơn"));
            checks.add(new Check("Khớp nguồn API · sau CK", Math.abs(net - total) < eps,
                    Ui.money(total) + " / " + Ui.money(net)));
            checks.add(new Check("Khớp nguồn API · COD + trả trước",
                    Math.abs((cod + prepaid) - (k.cod + k.prepaid)) < eps,
                    Ui.money(k.cod + k.prepaid) + " / " + Ui.money(cod + prepaid)));
        } else {
            checks.add(new Check("Đối soát nguồn API", true, "Đang có bộ lọc · kiểm tra nội bộ"));
        }
        return checks;
    }

    /** POS order list ("Tất cả", CSKH + Đơn đổi excluded) bridged to the dashboard revenue. */
    static final class PosBridge {
        double posNet, cancelledNet, untrackedNet, expectedNet, net;
        long posOrders, cancelledOrders, untrackedOrders, expectedOrders, orders;
        boolean ok;
    }

    /** posBridge() on the web: null without dimension filters, live data, and full day coverage. */
    static PosBridge posBridge(List<Order> rows, Filters f, Map<String, double[]> pos, String source,
                               String metaFrom, String metaTo) {
        if (f.hasDimensionFilter() || pos == null || !"PANCAKE".equals(source)) return null;
        List<String> dates = days(f.from, f.to);
        if (dates.isEmpty()) return null;
        if ((!metaFrom.isEmpty() && dates.get(0).compareTo(metaFrom) < 0)
                || (!metaTo.isEmpty() && dates.get(dates.size() - 1).compareTo(metaTo) > 0)) return null;
        PosBridge b = new PosBridge();
        for (String d : dates) {
            double[] r = pos.get(d);
            if (r == null) continue;
            b.posOrders += Math.round(r[DashboardData.P_POS_ORDERS]);
            b.posNet += r[DashboardData.P_POS_NET];
            b.cancelledOrders += Math.round(r[DashboardData.P_CANCELLED_ORDERS]);
            b.cancelledNet += r[DashboardData.P_CANCELLED_NET];
            b.untrackedOrders += Math.round(r[DashboardData.P_UNTRACKED_ORDERS]);
            b.untrackedNet += r[DashboardData.P_UNTRACKED_NET];
        }
        Overview k = overview(rows);
        b.expectedNet = b.posNet - b.cancelledNet - b.untrackedNet;
        b.expectedOrders = b.posOrders - b.cancelledOrders - b.untrackedOrders;
        b.net = k.created;
        b.orders = k.orders;
        b.ok = Math.abs(b.expectedNet - k.created) < .01 && b.expectedOrders == k.orders;
        return b;
    }

    static Map<String, double[]> dayReconciliationOf(List<Order> orders) {
        Map<String, double[]> actual = new LinkedHashMap<>();
        for (Order o : orders) {
            if (isDefaultExcluded(o)) continue;
            String date = orderDate(o);
            double[] d = actual.get(date);
            if (d == null) {
                d = new double[5];
                actual.put(date, d);
            }
            d[DashboardData.R_ORDERS]++;
            d[DashboardData.R_NET] += revenue(o);
            d[DashboardData.R_COD] += o.codAmount;
            d[DashboardData.R_PREPAID] += o.prepaidAmount;
            d[DashboardData.R_GROSS] += gross(o);
        }
        return actual;
    }

    /** verifySnapshot() on the web: refuse a payload whose orders do not add up to the API totals. */
    static void verify(DashboardData p) {
        if (p.dayReconciliation.isEmpty()) return;
        Map<String, double[]> actual = dayReconciliationOf(p.orders);
        if (actual.size() != p.dayReconciliation.size()) {
            throw new IllegalStateException("Dữ liệu Pancake không khớp số ngày báo cáo");
        }
        for (Map.Entry<String, double[]> e : p.dayReconciliation.entrySet()) {
            double[] ref = e.getValue();
            double[] d = actual.get(e.getKey());
            boolean bad = d == null || Math.round(d[0]) != Math.round(ref[0]);
            for (int i = 1; !bad && i <= 4; i++) {
                if (Math.abs(d[i] - ref[i]) > .01) bad = true;
            }
            if (bad) throw new IllegalStateException("Dữ liệu đồng bộ chưa khớp tại ngày " + e.getKey());
        }
    }

    // --------------------------------------------------------------- products

    private static final Pattern CODE_SUFFIX = Pattern.compile("^([A-Z]\\d{6}[A-Z]{1,3})(?:1[1-5]|[1-5])$");
    private static final Pattern CODE_FULL = Pattern.compile("^[A-Z]\\d{6}[A-Z]{1,3}$");
    private static final Pattern CODE_SHORT = Pattern.compile("^[A-Z]\\d{6}$");
    private static final Pattern CODE_IN_TEXT = Pattern.compile(
            "(?:^|[^A-Z0-9])([A-Z]\\d{6}[A-Z]{1,3})(?:1[1-5]|[1-5])?(?=$|[^A-Z0-9])");
    private static final Pattern SHORT_IN_TEXT = Pattern.compile("(?:^|[^A-Z0-9])([A-Z]\\d{6})(?=$|[^A-Z0-9])");

    /** Parent Seven.AM code: drops the size digit (e.g. A123456B2 -> A123456B). */
    static String sevenCode(String raw) {
        if (raw == null) return "";
        String value = raw.trim().toUpperCase(Locale.ROOT);
        if (value.isEmpty()) return "";
        String compact = value.replaceAll("\\s+", "");
        Matcher m = CODE_SUFFIX.matcher(compact);
        if (m.find()) return m.group(1);
        if (CODE_FULL.matcher(compact).matches() || CODE_SHORT.matcher(compact).matches()) return compact;
        m = CODE_IN_TEXT.matcher(value);
        if (m.find()) return m.group(1);
        m = SHORT_IN_TEXT.matcher(value);
        return m.find() ? m.group(1) : "";
    }

    static final class Product {
        String code = "", name = "", imageUrl = "";
        double sold, returned;
        int orders, returnOrders;

        double net() {
            return Math.max(0, sold - returned);
        }

        double returnRate() {
            return sold > 0 ? returned / sold : 0;
        }
    }

    static final class ProductStats {
        final List<Product> products = new ArrayList<>();
        int ordersWithItems, ordersMissingItems, partialUnknown;

        double sold() {
            double s = 0;
            for (Product p : products) s += p.sold;
            return s;
        }

        double returned() {
            double s = 0;
            for (Product p : products) s += p.returned;
            return s;
        }
    }

    static ProductStats aggregateProducts(List<Order> rows) {
        Map<String, Product> map = new LinkedHashMap<>();
        ProductStats out = new ProductStats();
        for (Order o : rows) {
            if (o.products.isEmpty()) {
                out.ordersMissingItems++;
                continue;
            }
            out.ordersWithItems++;
            if (o.partialReturnProductDetailMissing) out.partialUnknown++;
            Set<String> seen = new HashSet<>();
            String orderKey = !o.orderCode.isEmpty() ? o.orderCode : (!o.createdAt.isEmpty() ? o.createdAt : "unknown-order");
            for (int i = 0; i < o.products.size(); i++) {
                ProductLine item = o.products.get(i);
                double qty = Math.max(0, item.quantity);
                if (qty <= 0) continue;
                double ret = Math.min(qty, Math.max(0, item.returnedQuantity));
                String code = sevenCode(item.displayCode);
                if (code.isEmpty()) code = sevenCode(item.productCode);
                if (code.isEmpty()) code = sevenCode(item.sku);
                if (code.isEmpty()) code = sevenCode(item.name);
                String fallbackKey = (!item.productId.isEmpty() ? item.productId
                        : !item.variationId.isEmpty() ? item.variationId : item.name).toLowerCase(Locale.ROOT);
                if (fallbackKey.isEmpty()) fallbackKey = "unknown:" + orderKey + ":" + i;
                String key = !code.isEmpty() ? "code:" + code.toLowerCase(Locale.ROOT) : "fallback:" + fallbackKey;
                Product p = map.get(key);
                if (p == null) {
                    p = new Product();
                    p.code = code;
                    p.name = !item.name.isEmpty() ? item.name : (!code.isEmpty() ? code : "Chưa rõ sản phẩm");
                    p.imageUrl = item.imageUrl;
                    map.put(key, p);
                } else if (p.imageUrl.isEmpty() && !item.imageUrl.isEmpty()) {
                    p.imageUrl = item.imageUrl;
                }
                p.sold += qty;
                p.returned += ret;
                if (seen.add(key)) p.orders++;
                if (ret > 0 && seen.add(key + "|" + orderKey)) p.returnOrders++;
            }
        }
        out.products.addAll(map.values());
        Collections.sort(out.products, (a, b) -> {
            int c = Double.compare(b.sold, a.sold);
            if (c != 0) return c;
            c = Double.compare(b.net(), a.net());
            if (c != 0) return c;
            c = Integer.compare(b.orders, a.orders);
            if (c != 0) return c;
            return a.code.compareTo(b.code);
        });
        return out;
    }

    // ------------------------------------------------------------------ pages

    static final class PageGroup {
        String key, name, pageId;
        final List<Order> rows = new ArrayList<>();
        Overview k;
    }

    /** Page revenue groups: drops Đơn đổi and Live/Livestream sources, like renderPages(). */
    static List<PageGroup> pageGroups(List<Order> rows) {
        Map<String, PageGroup> map = new LinkedHashMap<>();
        for (Order o : rows) {
            if (!isPageRevenue(o)) continue;
            String key = pageKey(o);
            PageGroup g = map.get(key);
            if (g == null) {
                g = new PageGroup();
                g.key = key;
                g.name = pageLabel(o);
                g.pageId = o.pageId;
                map.put(key, g);
            }
            g.rows.add(o);
        }
        List<PageGroup> list = new ArrayList<>(map.values());
        for (PageGroup g : list) g.k = overview(g.rows);
        list.sort((a, b) -> {
            int c = Double.compare(b.k.created, a.k.created);
            if (c != 0) return c;
            c = Integer.compare(b.k.orders, a.k.orders);
            if (c != 0) return c;
            return a.name.compareTo(b.name);
        });
        return list;
    }

    private Metrics() {}
}
