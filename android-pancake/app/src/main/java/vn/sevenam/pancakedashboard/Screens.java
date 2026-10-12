package vn.sevenam.pancakedashboard;

import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Builds the six dashboard views. Each section mirrors a panel of the web dashboard;
 * wide web tables become stacked cards so they read well on a phone.
 */
final class Screens {
    private final MainActivity h;
    private boolean productsExpanded = false;

    Screens(MainActivity host) {
        this.h = host;
    }

    View build(String tab) {
        LinearLayout page = Ui.column(h);
        if (!h.isUnlocked()) {
            page.addView(locked(), Ui.block(12));
            return page;
        }
        if ("products".equals(tab)) {
            products(page);
            page.addView(footer());
            return page;
        }
        String cov = h.coverageError();
        if (cov != null) {
            page.addView(coverage(cov), Ui.block(12));
            return page;
        }
        List<Order> rows = Metrics.filter(h.orders, h.filters);
        switch (tab) {
            case "channels": channels(page, rows); break;
            case "pages": pages(page, rows); break;
            case "sales": sales(page, rows); break;
            case "monthly": monthly(page); break;
            default: overview(page, rows);
        }
        page.addView(footer());
        return page;
    }

    // ------------------------------------------------------------ helpers

    private LinearLayout card(LinearLayout page, String title, String sub, View trailing) {
        LinearLayout c = Ui.card(h);
        if (title != null) c.addView(Ui.cardHead(h, title, sub, trailing));
        page.addView(c, Ui.block(12));
        return c;
    }

    private void drill(View v, String type, String value, String title) {
        Ui.tap(v, () -> h.openDrill(type, value, title));
    }

    private int levelColor(String level) {
        switch (level) {
            case "good": return Ui.GOOD;
            case "warn": return Ui.WARN;
            case "bad": return Ui.BAD;
            default: return Ui.PRIMARY;
        }
    }

    private View locked() {
        LinearLayout c = Ui.card(h);
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        c.setPadding(Ui.dp(22), Ui.dp(28), Ui.dp(22), Ui.dp(24));
        TextView icon = Ui.text(h, "🔒", 30, Ui.PRIMARY, true);
        icon.setGravity(Gravity.CENTER);
        icon.setBackground(Ui.oval(Ui.PRIMARY_CONT));
        c.addView(icon, new LinearLayout.LayoutParams(Ui.dp(68), Ui.dp(68)));
        TextView t = Ui.text(h, "Mở dữ liệu Pancake LIVE", 19, Ui.ON_SURFACE, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, Ui.dp(16), 0, Ui.dp(6));
        c.addView(t);
        TextView s = Ui.text(h, "Nhập mật khẩu dashboard để xem doanh số Ads · Live · Zalo, Page, sản phẩm, Sale Online "
                + "và tiến độ tháng — cùng số liệu với website.", 13.5f, Ui.ON_VARIANT, false);
        s.setGravity(Gravity.CENTER);
        c.addView(s, Ui.block(18));
        TextView b = Ui.button(h, "Nhập mật khẩu", "filled");
        Ui.tap(b, h::openUnlock);
        c.addView(b, new LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(48)));
        return c;
    }

    private View coverage(String msg) {
        LinearLayout c = Ui.card(h);
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        c.setPadding(Ui.dp(20), Ui.dp(24), Ui.dp(20), Ui.dp(20));
        boolean loading = h.coverageLoading();
        if (loading) {
            ProgressBar pb = new ProgressBar(h);
            pb.setIndeterminate(true);
            c.addView(pb, new LinearLayout.LayoutParams(Ui.dp(40), Ui.dp(40)));
        }
        TextView t = Ui.text(h, loading ? "Đang tải từ Pancake POS" : "Chưa có đủ dữ liệu", 17, Ui.ON_SURFACE, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, Ui.dp(12), 0, Ui.dp(6));
        c.addView(t);
        TextView s = Ui.text(h, msg, 13, Ui.ON_VARIANT, false);
        s.setGravity(Gravity.CENTER);
        c.addView(s, Ui.block(loading ? 0 : 14));
        if (!loading) {
            TextView b = Ui.button(h, "Thử tải lại", "tonal");
            Ui.tap(b, () -> h.loadRange(true));
            c.addView(b, new LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(46)));
        }
        return c;
    }

    private View footer() {
        String when = MainActivity.formatInstant(h.lastUpdated);
        TextView t = Ui.text(h, "Seven.AM · Internal Revenue Dashboard\nCập nhật dữ liệu: " + (when.isEmpty() ? "—" : when)
                + " · doanh số sau chiết khấu · giờ Việt Nam", 11, Ui.ON_FAINT, false);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, Ui.dp(8), 0, Ui.dp(8));
        return t;
    }

    private View meterBlock(Metrics.Pace p, int color) {
        LinearLayout box = Ui.column(h);
        LinearLayout head = Ui.row(h);
        head.addView(Ui.text(h, "Đạt " + Ui.pct(p.completion) + " target", 12.5f, Ui.ON_SURFACE, true), Ui.weight(1));
        head.addView(Ui.text(h, "Thời gian " + Ui.pct(p.time) + " · phải đạt " + Ui.compact(p.expected), 11.5f, Ui.ON_VARIANT, false));
        box.addView(head, Ui.block(6));
        Charts.Meter m = new Charts.Meter(h).set(p.completion, p.time, color);
        box.addView(m, Ui.fixed(18, 0));
        return box;
    }

    // ----------------------------------------------------------- overview

    private void overview(LinearLayout page, List<Order> rows) {
        Filters f = h.filters;
        List<String> days = h.days();
        Metrics.Overview all = Metrics.overview(rows);

        TextView period = Ui.pill(h, Metrics.shortDay(f.from) + " → " + Metrics.shortDay(f.to) + " · "
                + Ui.num(rows.size()) + " đơn · " + f.label(), Ui.ON_VARIANT, Ui.SURFACE_HIGH);
        LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP);
        plp.bottomMargin = Ui.dp(10);
        page.addView(period, plp);

        hero(page, rows, days);
        alertsCard(page, rows, days);
        channelCards(page, rows, days);
        kpiTiles(page, rows, all);
        trendCard(page, rows, days);
        statusCard(page, rows);
        funnelCard(page, rows, all);
        returnReasonsCard(page, rows);
        reconciliationCard(page, rows);
    }

    private void hero(LinearLayout page, List<Order> rows, List<String> days) {
        String sel = h.filters.channel;
        Metrics.Pace p = Metrics.pace(h.store, Metrics.scopeForTarget(h.store, rows, sel), sel, days);
        Metrics.Overview k = p.k;
        LinearLayout c = Ui.card(h);
        c.setBackground(Ui.shape(0xFFFFF4F2, 0xFFF2D5D1, 24));
        c.setPadding(Ui.dp(18), Ui.dp(18), Ui.dp(18), Ui.dp(18));
        LinearLayout top = Ui.row(h);
        top.setGravity(Gravity.TOP);
        LinearLayout texts = Ui.column(h);
        texts.addView(Ui.text(h, Metrics.ALL.equals(sel) ? "Doanh số Ads + Live + Zalo" : "Doanh số " + Metrics.channelLabel(sel),
                13, Ui.ON_VARIANT, true));
        TextView value = Ui.oneLine(Ui.text(h, Ui.money(k.created), 30, Ui.ON_PRIMARY_CONT, true));
        value.setPadding(0, Ui.dp(4), 0, Ui.dp(4));
        texts.addView(value);
        double successShare = k.created > 0 ? k.success / k.created : 0;
        texts.addView(Ui.text(h, Ui.num(k.orders) + " đơn · AOV " + Ui.compact(k.aov) + " · thành công "
                + Ui.compact(k.success) + " (" + Ui.pct(successShare) + ")", 12.5f, Ui.ON_VARIANT, false));
        Metrics.PosBridge bridge = Metrics.posBridge(rows, h.filters, h.posRecon, h.source, h.metaFrom, h.metaTo);
        if (bridge != null) {
            StringBuilder sb = new StringBuilder("Đối chiếu POS ").append(Ui.money(bridge.posNet))
                    .append(" (").append(Ui.num(bridge.posOrders)).append(" đơn)");
            if (bridge.cancelledOrders > 0) {
                sb.append(" − huỷ ").append(Ui.money(bridge.cancelledNet)).append(" (").append(Ui.num(bridge.cancelledOrders)).append(")");
            }
            if (bridge.untrackedOrders > 0) {
                sb.append(" − ngoài Ads/Live/Zalo ").append(Ui.money(bridge.untrackedNet)).append(" (").append(Ui.num(bridge.untrackedOrders)).append(")");
            }
            sb.append(" = ").append(Ui.money(bridge.expectedNet))
                    .append(bridge.ok ? " ✓ khớp" : " ✕ lệch " + Ui.money(bridge.net - bridge.expectedNet));
            TextView recon = Ui.text(h, sb.toString(), 12, bridge.ok ? Ui.ON_VARIANT : Ui.BAD, false);
            recon.setPadding(0, Ui.dp(6), 0, 0);
            texts.addView(recon);
        }
        top.addView(texts, Ui.weight(1));
        LinearLayout.LayoutParams pl = new LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP);
        pl.leftMargin = Ui.dp(8);
        top.addView(Ui.levelPill(h, p.level(), p.text()), pl);
        c.addView(top, Ui.block(14));
        drill(texts, "all", "", "Tất cả đơn trong kỳ");

        if (!p.hasGoal()) {
            c.addView(Ui.note(h, "Nhập target tháng cho Ads, Live, Zalo để xem tiến độ, chênh lệch và dự báo.", "info"), Ui.block(10));
            TextView b = Ui.button(h, "Nhập target", "tonal");
            Ui.tap(b, h::openSettings);
            c.addView(b, new LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(44)));
        } else {
            c.addView(meterBlock(p, levelColor(p.level())), Ui.block(6));
            LinearLayout legend = Ui.row(h);
            legend.addView(Ui.dot(h, levelColor(p.level()), 8));
            TextView l1 = Ui.text(h, " Đã đạt    ", 11, Ui.ON_VARIANT, false);
            legend.addView(l1);
            View mark = new View(h);
            mark.setBackgroundColor(Ui.ON_SURFACE);
            legend.addView(mark, new LinearLayout.LayoutParams(Ui.dp(3), Ui.dp(10)));
            legend.addView(Ui.text(h, " Thời gian đã qua của khoảng lọc", 11, Ui.ON_VARIANT, false));
            c.addView(legend, Ui.block(14));
            boolean ahead = p.gap <= 0;
            List<View> stats = new ArrayList<>();
            stats.add(Ui.stat(h, "Target khoảng lọc", Ui.compact(p.goal), 0));
            stats.add(Ui.stat(h, ahead ? "Vượt mức phải đạt" : "Thiếu so với mức phải đạt", Ui.compact(Math.abs(p.gap)),
                    ahead ? Ui.GOOD : Ui.BAD));
            stats.add(Ui.stat(h, "Dự báo cuối kỳ", p.time > 0 ? Ui.compact(p.forecast) : "—", 0));
            boolean reached = k.created >= p.goal;
            stats.add(Ui.stat(h, "Cần mỗi ngày còn lại", reached ? "Đã đạt target"
                    : p.remaining > 0 ? Ui.compact(p.needPerDay) : "—", reached ? Ui.GOOD : 0));
            LinearLayout statBox = Ui.tonal(h, 0xB3FFFFFF);
            statBox.setPadding(Ui.dp(12), Ui.dp(12), Ui.dp(12), Ui.dp(12));
            statBox.addView(Ui.grid(h, stats, 2));
            c.addView(statBox);
        }
        page.addView(c, Ui.block(12));
    }

    private void alertsCard(LinearLayout page, List<Order> rows, List<String> days) {
        List<Metrics.Alert> alerts = Metrics.alerts(h.store, rows, h.filters, days, h.lastUpdated, h.transport);
        String health = "good";
        for (Metrics.Alert a : alerts) {
            if ("bad".equals(a.level)) {
                health = "bad";
                break;
            }
            if ("warn".equals(a.level)) health = "warn";
        }
        String healthText = "bad".equals(health) ? "Cần xử lý" : "warn".equals(health) ? "Theo dõi" : "Ổn định";
        LinearLayout c = card(page, "Điểm cần chú ý", "Tự phân tích theo khoảng ngày và bộ lọc đang chọn",
                Ui.levelPill(h, health, healthText));
        int shown = Math.min(6, alerts.size());
        for (int i = 0; i < shown; i++) {
            Metrics.Alert a = alerts.get(i);
            int[] col = Ui.levelColors(a.level);
            LinearLayout item = Ui.row(h);
            item.setGravity(Gravity.TOP);
            item.setBackground(Ui.shape(col[1], 0, 14));
            item.setPadding(Ui.dp(12), Ui.dp(10), Ui.dp(12), Ui.dp(10));
            View bar = new View(h);
            bar.setBackground(Ui.shape(col[0], 0, 4));
            LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(Ui.dp(4), Ui.dp(32));
            blp.rightMargin = Ui.dp(10);
            item.addView(bar, blp);
            LinearLayout texts = Ui.column(h);
            texts.addView(Ui.text(h, a.title, 13.5f, col[0], true));
            TextView t = Ui.text(h, a.text, 12.5f, Ui.ON_SURFACE, false);
            t.setPadding(0, Ui.dp(3), 0, 0);
            texts.addView(t);
            item.addView(texts, Ui.weight(1));
            c.addView(item, Ui.block(i == shown - 1 ? 0 : 8));
        }
    }

    private void channelCards(LinearLayout page, List<Order> rows, List<String> days) {
        String sel = h.filters.channel;
        double total = Metrics.sumRevenue(rows);
        for (int i = 0; i < Metrics.KPI_CHANNELS.length; i++) {
            final String ch = Metrics.KPI_CHANNELS[i];
            if (!Metrics.ALL.equals(sel) && !ch.equals(sel)) continue;
            List<Order> rr = Metrics.where(rows, o -> ch.equals(o.channel));
            Metrics.Pace p = Metrics.pace(h.store, rr, ch, days);
            Metrics.Overview k = p.k;
            double data = h.channelData(ch);
            int color = Metrics.channelColor(ch);
            LinearLayout c = Ui.card(h);
            LinearLayout head = Ui.row(h);
            head.addView(Ui.dot(h, color, 10));
            TextView name = Ui.text(h, "  " + Metrics.KPI_LABELS[i], 16, Ui.ON_SURFACE, true);
            head.addView(name, Ui.weight(1));
            head.addView(Ui.levelPill(h, p.level(), p.text()));
            c.addView(head, Ui.block(8));
            c.addView(Ui.oneLine(Ui.text(h, Ui.money(k.created), 23, Ui.ON_SURFACE, true)));
            TextView sub = Ui.text(h, Ui.num(k.orders) + " đơn · " + Ui.pct(total > 0 ? k.created / total : 0) + " tổng 3 kênh",
                    12, Ui.ON_VARIANT, false);
            sub.setPadding(0, Ui.dp(3), 0, Ui.dp(12));
            c.addView(sub);
            if (p.hasGoal()) c.addView(meterBlock(p, color), Ui.block(12));
            else c.addView(Ui.note(h, "Chưa có target cho kênh này.", "neutral"), Ui.block(12));
            double cr = data > 0 ? k.orders / data : Double.NaN;
            List<View> stats = new ArrayList<>();
            stats.add(Ui.stat(h, "Thành công", Ui.compact(k.success), 0));
            stats.add(Ui.stat(h, "AOV", Ui.compact(k.aov), 0));
            stats.add(Ui.stat(h, "Tỷ lệ hoàn", Ui.pct(k.returnRate), k.returnRate > .2 ? Ui.BAD : 0));
            stats.add(Ui.stat(h, "CR chốt", Ui.pct(cr), !Double.isNaN(cr) && cr < .1 ? Ui.BAD : 0));
            c.addView(Ui.grid(h, stats, 4));
            drill(c, "channel", ch, "Kênh · " + Metrics.KPI_LABELS[i]);
            page.addView(c, Ui.block(12));
        }
    }

    private void kpiTiles(LinearLayout page, List<Order> rows, Metrics.Overview k) {
        Filters f = h.filters;
        double data = Metrics.totalData(h.store, f, h.orders);
        int excluded = Metrics.excludedCount(h.orders, f);
        List<View> tiles = new ArrayList<>();
        tiles.add(tile("Thành công", Ui.compact(k.success), Ui.num(k.successOrders) + " đơn · " + share(k.success, k),
                Ui.ST_SUCCESS, "successful", "", "Đơn có doanh thu thành công"));
        tiles.add(tile("Đang giao", Ui.compact(k.shipping), share(k.shipping, k), Ui.ST_SHIP, "status", "DANG_GIAO", "Đơn đang giao"));
        tiles.add(tile("Treo", Ui.compact(k.pending), share(k.pending, k), Ui.ST_TREO, "status", "TREO", "Đơn treo"));
        tiles.add(tile("Hoàn", Ui.compact(k.returns), "Tỷ lệ hoàn " + Ui.pct(k.returnRate), Ui.ST_RETURN, "status", "HOAN", "Đơn hoàn"));
        tiles.add(tile("CR chốt", data > 0 ? Ui.pct(k.orders / data) : "—",
                data > 0 ? Ui.num(k.orders) + " đơn / " + Ui.num(data) + " data" : "Nhập Data ở màn Kênh", 0, null, null, null));
        tiles.add(tile("Đơn đã loại", Ui.num(excluded), "Huỷ/Xoá, Đơn đổi, CSKH", Ui.ST_CANCEL, "excluded", "", "Đơn đã loại"));
        tiles.add(tile("COD", Ui.compact(k.cod), "Tiền thu hộ", 0, "all", "", "Đơn tạo trong kỳ"));
        tiles.add(tile("Trả trước", Ui.compact(k.prepaid), "Khách đã thanh toán", 0, "all", "", "Đơn tạo trong kỳ"));
        tiles.add(tile("Chiết khấu", Ui.compact(k.discount), "Trước CK " + Ui.compact(k.gross), 0, null, null, null));
        tiles.add(tile("Data đã nhập", data > 0 ? Ui.num(data) : "—", "Theo khoảng ngày đang chọn", 0, null, null, null));
        tiles.add(tile("AOV", Ui.compact(k.aov), "Giá trị đơn trung bình", 0, null, null, null));
        tiles.add(tile("Số đơn", Ui.num(k.orders), Ui.num(k.successOrders) + " đơn thành công", 0, "all", "", "Tất cả đơn trong kỳ"));
        page.addView(Ui.grid(h, tiles, 2), Ui.block(12));
    }

    private String share(double v, Metrics.Overview k) {
        return k.created > 0 ? Ui.pct(v / k.created) + " doanh số" : "";
    }

    private View tile(String label, String value, String sub, int dot, String type, String drillValue, String title) {
        LinearLayout t = Ui.tile(h, label, value, sub, dot, 0);
        if (type != null) drill(t, type, drillValue, title);
        return t;
    }

    private void trendCard(LinearLayout page, List<Order> rows, List<String> days) {
        Filters f = h.filters;
        boolean single = f.from.equals(f.to);
        String sel = f.channel;
        List<Integer> chans = new ArrayList<>();
        for (int i = 0; i < Metrics.KPI_CHANNELS.length; i++) {
            if (Metrics.ALL.equals(sel) || Metrics.KPI_CHANNELS[i].equals(sel)) chans.add(i);
        }
        List<String> labels = new ArrayList<>();
        List<String> keys = new ArrayList<>();
        if (single) {
            int lo = 8, hi = 22;
            for (Order o : rows) {
                int hr = Metrics.orderHour(o);
                if (hr >= 0) {
                    lo = Math.min(lo, hr);
                    hi = Math.max(hi, hr);
                }
            }
            for (int hr = lo; hr <= hi; hr++) {
                String key = (hr < 10 ? "0" : "") + hr + "h";
                keys.add(key);
                labels.add(key);
            }
        } else {
            for (String d : days) {
                keys.add(d);
                labels.add(Metrics.shortDay(d));
            }
        }
        List<Charts.Series> series = new ArrayList<>();
        String[] names = new String[chans.size() + 1];
        int[] colors = new int[chans.size() + 1];
        boolean[] dashed = new boolean[chans.size() + 1];
        int n = 0;
        for (int idx : chans) {
            final String ch = Metrics.KPI_CHANNELS[idx];
            Map<String, List<Order>> g = Metrics.group(Metrics.where(rows, o -> ch.equals(o.channel)),
                    o -> single ? hourKey(o) : Metrics.orderDate(o));
            double[] values = new double[keys.size()];
            for (int i = 0; i < keys.size(); i++) {
                List<Order> rr = g.get(keys.get(i));
                values[i] = rr == null ? 0 : Metrics.sumRevenue(rr);
            }
            series.add(new Charts.Series(Metrics.KPI_LABELS[idx], Metrics.channelColor(ch), values, false));
            names[n] = Metrics.KPI_LABELS[idx];
            colors[n] = Metrics.channelColor(ch);
            n++;
        }
        boolean hasTarget = !single && chans.size() == 1 && Metrics.targetAvailable(h.store, sel);
        if (hasTarget) {
            double[] values = new double[keys.size()];
            Arrays.fill(values, Metrics.dailyTarget(h.store, f.from.substring(0, 7), sel));
            series.add(new Charts.Series("Target/ngày", Ui.ON_SURFACE, values, true));
            names[n] = "Target/ngày";
            colors[n] = Ui.ON_SURFACE;
            dashed[n] = true;
            n++;
        }
        LinearLayout c = card(page, "Xu hướng doanh số theo kênh",
                (single ? "Theo giờ trong ngày" : "Theo ngày") + " · doanh số sau chiết khấu · chạm để xem số", null);
        c.addView(Ui.legend(h, Arrays.copyOf(names, n), Arrays.copyOf(colors, n), Arrays.copyOf(dashed, n)));
        Charts.LineChart chart = new Charts.LineChart(h).set(labels, series, Ui::money);
        c.addView(chart, Ui.fixed(220, 0));
    }

    private static String hourKey(Order o) {
        int hr = Metrics.orderHour(o);
        return hr < 0 ? "—" : (hr < 10 ? "0" : "") + hr + "h";
    }

    private void statusCard(LinearLayout page, List<Order> rows) {
        LinearLayout c = card(page, "Trạng thái đơn", "Tỷ trọng doanh số theo trạng thái hiện tại · chạm để xem đơn", null);
        Map<String, List<Order>> g = Metrics.group(rows, o -> o.status);
        double total = Metrics.sumRevenue(rows);
        String[] order = {"THANH_CONG", "DANG_GIAO", "TREO", "HOAN", "HUY"};
        LinearLayout stack = Ui.row(h);
        stack.setBackground(Ui.shape(Ui.SURFACE_HIGH, 0, 100));
        stack.setClipToOutline(true);
        boolean any = false;
        for (String s : order) {
            List<Order> rr = g.get(s);
            double v = rr == null ? 0 : Metrics.sumRevenue(rr);
            if (v <= 0) continue;
            any = true;
            View seg = new View(h);
            seg.setBackgroundColor(Metrics.statusColor(s));
            stack.addView(seg, new LinearLayout.LayoutParams(0, Ui.MATCH, (float) v));
        }
        if (!any) stack.addView(new View(h), new LinearLayout.LayoutParams(0, Ui.MATCH, 1));
        c.addView(stack, Ui.fixed(14, 12));
        for (String s : order) {
            List<Order> rr = g.get(s);
            int count = rr == null ? 0 : rr.size();
            if (count == 0 && "HUY".equals(s)) continue;
            double v = rr == null ? 0 : Metrics.sumRevenue(rr);
            LinearLayout r = Ui.row(h);
            r.setPadding(Ui.dp(4), Ui.dp(9), Ui.dp(4), Ui.dp(9));
            r.addView(Ui.dot(h, Metrics.statusColor(s), 10));
            TextView name = Ui.text(h, "  " + Metrics.statusLabel(s), 14, Ui.ON_SURFACE, true);
            r.addView(name, Ui.weight(1));
            r.addView(Ui.text(h, Ui.num(count) + " đơn · " + Ui.pct(total > 0 ? v / total : 0) + "   ", 12, Ui.ON_VARIANT, false));
            r.addView(Ui.text(h, Ui.compact(v), 14, Ui.ON_SURFACE, true));
            drill(r, "status", s, Metrics.statusLabel(s));
            c.addView(r);
        }
        TextView detailHead = Ui.text(h, "CHI TIẾT TRẠNG THÁI PANCAKE · SỐ ĐƠN · DOANH SỐ", 10.5f, Ui.PRIMARY, true);
        detailHead.setLetterSpacing(.06f);
        detailHead.setPadding(Ui.dp(4), Ui.dp(14), 0, Ui.dp(8));
        c.addView(detailHead);
        String[] labels = {"Mới", "Chờ hàng", "Đã xác nhận", "Chờ chuyển hàng", "Đang giao", "Thành công", "Hoàn", "Hoàn 1 phần"};
        int[][] codes = {{0}, {11}, {1}, {9}, {2}, {3, 16}, {4, 5}, {15}};
        List<View> cells = new ArrayList<>();
        for (int i = 0; i < labels.length; i++) {
            final int[] cs = codes[i];
            List<Order> rr = Metrics.where(rows, o -> {
                for (int code : cs) if (o.statusCode == code) return true;
                return false;
            });
            LinearLayout cell = Ui.tonal(h, rr.isEmpty() ? Ui.SURFACE_LOW : Ui.SURFACE_HIGH);
            cell.addView(Ui.oneLine(Ui.text(h, labels[i], 12, rr.isEmpty() ? Ui.ON_FAINT : Ui.ON_VARIANT, true)));
            TextView v = Ui.oneLine(Ui.text(h, Ui.num(rr.size()) + " đơn · " + Ui.compact(Metrics.sumRevenue(rr)), 13,
                    rr.isEmpty() ? Ui.ON_FAINT : Ui.ON_SURFACE, true));
            v.setPadding(0, Ui.dp(3), 0, 0);
            cell.addView(v);
            if (!rr.isEmpty()) {
                StringBuilder sb = new StringBuilder();
                for (int code : cs) sb.append(sb.length() > 0 ? "," : "").append(code);
                drill(cell, "statusCodes", sb.toString(), labels[i]);
            }
            cells.add(cell);
        }
        c.addView(Ui.grid(h, cells, 2));
    }

    private void funnelCard(LinearLayout page, List<Order> rows, Metrics.Overview k) {
        LinearLayout c = card(page, "Phễu vận hành", "Data → tạo đơn → trạng thái hiện tại", null);
        double data = Metrics.totalData(h.store, h.filters, h.orders);
        int base = Math.max(1, rows.size());
        List<View> cells = new ArrayList<>();
        LinearLayout dataCell = Ui.tile(h, "Data", data > 0 ? Ui.num(data) : "Chưa nhập",
                data > 0 ? "CR " + Ui.pct(rows.size() / data) : "Nhập ở màn Kênh", 0, 0);
        cells.add(dataCell);
        cells.add(stage("Tạo đơn", rows.size(), base, k.created, 0, "all", ""));
        cells.add(stage("Treo", k.pendingOrders, base, k.pending, Ui.ST_TREO, "status", "TREO"));
        cells.add(stage("Đang giao", k.shippingOrders, base, k.shipping, Ui.ST_SHIP, "status", "DANG_GIAO"));
        cells.add(stage("Thành công", k.successOrders, base, k.success, Ui.ST_SUCCESS, "successful", ""));
        cells.add(stage("Hoàn", k.returnOrders, base, k.returns, Ui.ST_RETURN, "status", "HOAN"));
        c.addView(Ui.grid(h, cells, 2));
    }

    private View stage(String label, int count, int base, double value, int dot, String type, String drillValue) {
        LinearLayout t = Ui.tile(h, label, Ui.compact(value), Ui.num(count) + " đơn · " + Ui.pct((double) count / base), dot, 0);
        drill(t, type, drillValue, label);
        return t;
    }

    private void returnReasonsCard(LinearLayout page, List<Order> rows) {
        List<Order> returns = Metrics.where(rows, o -> "HOAN".equals(o.status));
        Map<String, List<Order>> g = Metrics.group(returns, Metrics::returnReason);
        List<Map.Entry<String, List<Order>>> list = new ArrayList<>(g.entrySet());
        list.sort((a, b) -> {
            int c = Integer.compare(b.getValue().size(), a.getValue().size());
            if (c != 0) return c;
            return Double.compare(sumReturned(b.getValue()), sumReturned(a.getValue()));
        });
        List<Order> missing = g.get(Metrics.NO_REASON);
        String summary = Ui.num(returns.size()) + " đơn hoàn" + (missing != null ? " · " + missing.size() + " chưa có lý do" : "");
        LinearLayout c = card(page, "Lý do hoàn", "Giá trị phần hàng hoàn · chạm để xem đơn",
                Ui.pill(h, summary, Ui.ON_VARIANT, Ui.SURFACE_HIGH));
        if (list.isEmpty()) {
            c.addView(Ui.empty(h, "Không có đơn hoàn trong khoảng đang chọn."));
            return;
        }
        for (Map.Entry<String, List<Order>> e : list) {
            int count = e.getValue().size();
            double sharePct = returns.isEmpty() ? 0 : (double) count / returns.size();
            LinearLayout item = Ui.column(h);
            item.setPadding(0, Ui.dp(8), 0, Ui.dp(8));
            LinearLayout r = Ui.row(h);
            r.addView(Ui.oneLine(Ui.text(h, e.getKey(), 13.5f, Ui.ON_SURFACE, true)), Ui.weight(1));
            r.addView(Ui.text(h, Ui.num(count) + " đơn · " + Ui.pct(sharePct) + " · " + Ui.compact(sumReturned(e.getValue())),
                    12, Ui.ON_VARIANT, false));
            item.addView(r, Ui.block(6));
            item.addView(Ui.bar(h, sharePct, Ui.ST_RETURN));
            drill(item, "returnReason", e.getKey(), "Hoàn · " + e.getKey());
            c.addView(item);
        }
    }

    private static double sumReturned(List<Order> rows) {
        double s = 0;
        for (Order o : rows) s += Metrics.returned(o);
        return s;
    }

    private void reconciliationCard(LinearLayout page, List<Order> rows) {
        List<Metrics.Check> checks = Metrics.reconciliation(rows, h.filters, h.dayRecon);
        Metrics.PosBridge b = Metrics.posBridge(rows, h.filters, h.posRecon, h.source, h.metaFrom, h.metaTo);
        if (b != null && !h.dayRecon.isEmpty()) {
            checks.add(new Metrics.Check("POS · Tất cả (loại CSKH + Đơn đổi)", true,
                    Ui.money(b.posNet) + " · " + Ui.num(b.posOrders) + " đơn"));
            checks.add(new Metrics.Check("− Đơn huỷ / xoá", true,
                    Ui.money(b.cancelledNet) + " · " + Ui.num(b.cancelledOrders) + " đơn"));
            if (b.untrackedOrders > 0) {
                checks.add(new Metrics.Check("− Ngoài Ads / Live / Zalo", true,
                        Ui.money(b.untrackedNet) + " · " + Ui.num(b.untrackedOrders) + " đơn"));
            }
            checks.add(new Metrics.Check("= Khớp POS sau khi trừ", b.ok,
                    Ui.money(b.expectedNet) + " · " + Ui.num(b.expectedOrders) + " đơn"));
        }
        boolean bad = false;
        for (Metrics.Check ch : checks) if (!ch.ok) bad = true;
        LinearLayout c = card(page, "Đối soát dữ liệu", "Tổng = kênh = Sale = trạng thái = nguồn API",
                Ui.levelPill(h, bad ? "bad" : "good", bad ? "CÓ LỆCH" : "DỮ LIỆU OK"));
        for (int i = 0; i < checks.size(); i++) {
            Metrics.Check ch = checks.get(i);
            if (i > 0) c.addView(Ui.divider(h));
            c.addView(Ui.kv(h, ch.name, ch.text + (ch.ok ? "  ✓" : "  ✕"), ch.ok ? Ui.GOOD : Ui.BAD));
        }
    }

    // ----------------------------------------------------------- channels

    private static final class ChannelStat {
        String name;
        Metrics.Overview k;
        double data;
    }

    private void channels(LinearLayout page, List<Order> rows) {
        String sel = h.filters.channel;
        Map<String, List<Order>> g = Metrics.group(rows, o -> o.channel);
        List<ChannelStat> all = new ArrayList<>();
        for (String ch : Metrics.KPI_CHANNELS) {
            ChannelStat s = new ChannelStat();
            s.name = ch;
            List<Order> rr = g.get(ch);
            s.k = Metrics.overview(rr == null ? new ArrayList<>() : rr);
            s.data = h.channelData(ch);
            all.add(s);
        }
        all.sort((a, b) -> Double.compare(b.k.created, a.k.created));
        List<ChannelStat> stats = new ArrayList<>();
        for (ChannelStat s : all) if (Metrics.ALL.equals(sel) || s.name.equals(sel)) stats.add(s);
        Metrics.Overview total = Metrics.overview(rows);
        double totalBase = Math.max(1, total.created);
        double sumData = 0;
        for (ChannelStat s : stats) sumData += s.data;

        page.addView(Ui.note(h, "Nhập Data từng kênh rồi bấm Xong trên bàn phím → CR chốt tính ngay. "
                + "Data lưu trên máy theo đúng khoảng ngày đang chọn.", "info"), Ui.block(12));

        LinearLayout summary = card(page, "Tổng quan kênh", null, null);
        List<View> sumStats = new ArrayList<>();
        if (Metrics.ALL.equals(sel)) {
            double fb = 0;
            for (ChannelStat s : all) if (Metrics.CH_ADS.equals(s.name) || Metrics.CH_LIVE.equals(s.name)) fb += s.k.created;
            sumStats.add(Ui.stat(h, "FB tổng (Ads + Live)", Ui.compact(fb), 0));
        } else {
            sumStats.add(Ui.stat(h, Metrics.channelLabel(sel), Ui.compact(total.created), 0));
        }
        sumStats.add(Ui.stat(h, "Data", sumData > 0 ? Ui.num(sumData) : "Chưa nhập", 0));
        double crAll = sumData > 0 ? total.orders / sumData : Double.NaN;
        sumStats.add(Ui.stat(h, "CR tổng", Ui.pct(crAll), !Double.isNaN(crAll) && crAll < .1 ? Ui.BAD : 0));
        summary.addView(Ui.grid(h, sumStats, 3));

        LinearLayout compare = card(page, "So sánh doanh số kênh", "Tạo đơn và thành công", null);
        compare.addView(Ui.legend(h, new String[]{"Tạo đơn", "Thành công"}, new int[]{Ui.ON_SURFACE, 0x66201A18}, null));
        List<Charts.HRow> cmpRows = new ArrayList<>();
        int[] rowColors = new int[stats.size()];
        for (int i = 0; i < stats.size(); i++) {
            ChannelStat s = stats.get(i);
            cmpRows.add(new Charts.HRow(Metrics.channelLabel(s.name), new double[]{s.k.created, s.k.success},
                    Ui.compact(s.k.created) + " · TC " + Ui.compact(s.k.success)));
            rowColors[i] = Metrics.channelColor(s.name);
        }
        compare.addView(new Charts.HBars(h).set(cmpRows, new int[]{Ui.PRIMARY}, rowColors, -1), Ui.block(0));

        LinearLayout crCard = card(page, "CR chốt theo kênh", "CR = số đơn tạo / Data đã nhập · dưới 10% tô đỏ", null);
        List<Charts.HRow> crRows = new ArrayList<>();
        int[] crColors = new int[stats.size()];
        for (int i = 0; i < stats.size(); i++) {
            ChannelStat s = stats.get(i);
            double cr = s.data > 0 ? s.k.orders / s.data : Double.NaN;
            crRows.add(new Charts.HRow(Metrics.channelLabel(s.name), new double[]{Double.isNaN(cr) ? 0 : cr * 100},
                    Double.isNaN(cr) ? "Chưa nhập Data" : Ui.pct(cr)));
            crColors[i] = !Double.isNaN(cr) && cr < .1 ? Ui.BAD : Metrics.channelColor(s.name);
        }
        double crMax = 15;
        for (Charts.HRow x : crRows) crMax = Math.max(crMax, x.values[0] * 1.1);
        crCard.addView(new Charts.HBars(h).set(crRows, new int[]{Ui.PRIMARY}, crColors, crMax));

        for (ChannelStat s : stats) {
            LinearLayout c = Ui.card(h);
            LinearLayout head = Ui.row(h);
            head.addView(Ui.dot(h, Metrics.channelColor(s.name), 10));
            head.addView(Ui.text(h, "  " + s.name, 16, Ui.ON_SURFACE, true), Ui.weight(1));
            head.addView(Ui.pill(h, Ui.pct(s.k.created / totalBase) + " tỷ trọng", Ui.ON_VARIANT, Ui.SURFACE_HIGH));
            c.addView(head, Ui.block(10));
            double cr = s.data > 0 ? s.k.orders / s.data : Double.NaN;
            List<View> cells = new ArrayList<>();
            cells.add(Ui.stat(h, "Tạo đơn", Ui.compact(s.k.created), 0));
            cells.add(Ui.stat(h, "Thành công", Ui.compact(s.k.success), Ui.GOOD));
            cells.add(Ui.stat(h, "Số đơn", Ui.num(s.k.orders), 0));
            cells.add(Ui.stat(h, "AOV", Ui.compact(s.k.aov), 0));
            cells.add(Ui.stat(h, "Hoàn", Ui.pct(s.k.returnRate), s.k.returnRate > .2 ? Ui.BAD : 0));
            cells.add(Ui.stat(h, "CR chốt", Ui.pct(cr), !Double.isNaN(cr) && cr < .1 ? Ui.BAD : 0));
            c.addView(Ui.grid(h, cells, 3), Ui.block(12));

            LinearLayout dataRow = Ui.row(h);
            dataRow.addView(Ui.text(h, "Data kênh", 13, Ui.ON_VARIANT, true), Ui.weight(1));
            EditText input = h.field("Nhập data", s.data > 0 ? String.valueOf(Math.round(s.data)) : "", false);
            input.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
            input.setImeOptions(EditorInfo.IME_ACTION_DONE);
            final String ch = s.name;
            input.setOnEditorActionListener((v, actionId, ev) -> {
                h.setChannelData(ch, MainActivity.parseNumber(input.getText().toString()));
                h.flushPendingRender();
                return false;
            });
            input.setOnFocusChangeListener((v, focused) -> {
                if (!focused) {
                    h.main.post(() -> {
                        h.setChannelData(ch, MainActivity.parseNumber(input.getText().toString()));
                        h.flushPendingRender();
                    });
                }
            });
            dataRow.addView(input, new LinearLayout.LayoutParams(Ui.dp(150), Ui.dp(46)));
            c.addView(dataRow, Ui.block(10));
            TextView more = Ui.button(h, "Xem đơn kênh ›", "outlined");
            drill(more, "channel", s.name, "Kênh · " + Metrics.channelLabel(s.name));
            c.addView(more, new LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(42)));
            page.addView(c, Ui.block(12));
        }
    }

    // -------------------------------------------------------------- pages

    private void pages(LinearLayout page, List<Order> rows) {
        List<Metrics.PageGroup> groups = Metrics.pageGroups(rows);
        List<Metrics.PageGroup> identified = new ArrayList<>();
        int unidentified = 0;
        List<Order> relevant = new ArrayList<>();
        for (Metrics.PageGroup g : groups) {
            relevant.addAll(g.rows);
            if (Metrics.NO_PAGE.equals(g.name)) unidentified += g.rows.size();
            else identified.add(g);
        }
        int liveExcluded = Metrics.where(rows, o -> Metrics.isPageRelevant(o) && Metrics.isLiveSource(o)).size();
        int exchangeExcluded = Metrics.where(rows, o -> Metrics.isPageRelevant(o) && Metrics.isExchange(o)).size();
        Metrics.Overview totals = Metrics.overview(relevant);
        double total = totals.created;
        Metrics.PageGroup top = !identified.isEmpty() ? identified.get(0) : (!groups.isEmpty() ? groups.get(0) : null);

        page.addView(Ui.note(h, "Dùng đúng logic doanh thu Tổng quan · loại Đơn đổi và nguồn Live/Livestream · "
                + "lọc theo ngày, kênh, Sale và trạng thái.", "info"), Ui.block(12));
        List<View> tiles = new ArrayList<>();
        tiles.add(Ui.tile(h, "Số Page", Ui.num(identified.size()), Ui.compact(total) + " doanh thu", 0, 0));
        tiles.add(Ui.tile(h, "Doanh thu Page", Ui.compact(total), Ui.money(total), 0, 0));
        tiles.add(Ui.tile(h, "Thành công", Ui.compact(totals.success), Ui.money(totals.success), Ui.ST_SUCCESS, 0));
        tiles.add(Ui.tile(h, "Đơn chưa rõ Page", Ui.num(unidentified), "Gom vào “" + Metrics.NO_PAGE + "”", 0,
                unidentified > 0 ? Ui.WARN : 0));
        page.addView(Ui.grid(h, tiles, 2), Ui.block(8));
        if (top != null) {
            LinearLayout topTile = Ui.tile(h, "Top Page", top.name, Ui.compact(top.k.created) + " · " + Ui.num(top.k.orders) + " đơn",
                    Ui.PRIMARY, 0);
            drill(topTile, "page", top.key, "Page · " + top.name);
            page.addView(topTile, Ui.block(12));
        }
        List<String> notes = new ArrayList<>();
        if (unidentified > 0) notes.add(Ui.num(unidentified) + " đơn chưa xác định được Page; đang gom riêng vào “" + Metrics.NO_PAGE + "”.");
        if (liveExcluded > 0) notes.add("Đã loại " + Ui.num(liveExcluded) + " đơn nguồn Live/Livestream khỏi doanh thu Page.");
        if (exchangeExcluded > 0) notes.add("Đã loại " + Ui.num(exchangeExcluded) + " đơn đổi khỏi doanh thu Page.");
        if (relevant.isEmpty()) notes.add("Không có đơn Page hợp lệ sau khi loại Đơn đổi và nguồn Live/Livestream.");
        if (!notes.isEmpty()) page.addView(Ui.note(h, String.join(" ", notes), "warn"), Ui.block(12));

        List<Metrics.PageGroup> chart = identified.subList(0, Math.min(12, identified.size()));
        LinearLayout revCard = card(page, "Top Page theo doanh thu", "Tạo đơn và thành công · tối đa 12 Page", null);
        revCard.addView(Ui.legend(h, new String[]{"Tạo đơn", "Thành công"}, new int[]{Ui.PRIMARY, 0x66A7192E}, null));
        List<Charts.HRow> revRows = new ArrayList<>();
        for (Metrics.PageGroup g : chart) {
            revRows.add(new Charts.HRow(g.name, new double[]{g.k.created, g.k.success},
                    Ui.compact(g.k.created) + " · TC " + Ui.compact(g.k.success)));
        }
        revCard.addView(new Charts.HBars(h).set(revRows, new int[]{Ui.PRIMARY}, null, -1));

        LinearLayout shareCard = card(page, "Tỷ trọng doanh thu Page", "Trên tổng doanh thu các Page", null);
        List<Charts.HRow> shareRows = new ArrayList<>();
        for (Metrics.PageGroup g : chart) {
            double sh = total > 0 ? g.k.created / total : 0;
            shareRows.add(new Charts.HRow(g.name, new double[]{sh * 100}, Ui.pct(sh)));
        }
        shareCard.addView(new Charts.HBars(h).set(shareRows, new int[]{Ui.INFO}, null, -1));

        LinearLayout listHead = Ui.column(h);
        listHead.addView(Ui.sectionHead(h, "Page performance", "Doanh thu từng Page", "Chạm vào một Page để xem chi tiết đơn"));
        page.addView(listHead);
        if (groups.isEmpty()) page.addView(Ui.empty(h, "Không có dữ liệu Page trong khoảng lọc."));
        for (int i = 0; i < groups.size(); i++) {
            Metrics.PageGroup g = groups.get(i);
            LinearLayout c = Ui.card(h);
            LinearLayout head = Ui.row(h);
            TextView rank = Ui.pill(h, "#" + (i + 1), Ui.ON_PRIMARY_CONT, Ui.PRIMARY_CONT);
            head.addView(rank);
            LinearLayout names = Ui.column(h);
            names.setPadding(Ui.dp(10), 0, 0, 0);
            names.addView(Ui.oneLine(Ui.text(h, g.name, 15, Ui.ON_SURFACE, true)));
            names.addView(Ui.oneLine(Ui.text(h, g.pageId.isEmpty() ? "Page ID —" : "ID " + g.pageId, 11.5f, Ui.ON_FAINT, false)));
            head.addView(names, Ui.weight(1));
            head.addView(Ui.text(h, Ui.compact(g.k.created), 17, Ui.ON_SURFACE, true));
            c.addView(head, Ui.block(12));
            List<View> cells = new ArrayList<>();
            cells.add(Ui.stat(h, "Thành công", Ui.compact(g.k.success), Ui.GOOD));
            cells.add(Ui.stat(h, "Số đơn", Ui.num(g.k.orders), 0));
            cells.add(Ui.stat(h, "Đơn TC", Ui.num(g.k.successOrders), 0));
            cells.add(Ui.stat(h, "Treo", Ui.compact(g.k.pending), 0));
            cells.add(Ui.stat(h, "Đang giao", Ui.compact(g.k.shipping), 0));
            cells.add(Ui.stat(h, "Hoàn", Ui.compact(g.k.returns), 0));
            cells.add(Ui.stat(h, "Tỷ lệ hoàn", Ui.pct(g.k.returnRate), g.k.returnRate > .2 ? Ui.BAD : 0));
            cells.add(Ui.stat(h, "AOV", Ui.compact(g.k.aov), 0));
            cells.add(Ui.stat(h, "Tỷ trọng", Ui.pct(total > 0 ? g.k.created / total : 0), 0));
            c.addView(Ui.grid(h, cells, 3));
            drill(c, "page", g.key, "Page · " + g.name);
            page.addView(c, Ui.block(10));
        }
    }

    // ----------------------------------------------------------- products

    private void products(LinearLayout page) {
        String[] range = h.prodRange();
        String key = range[0] + "|" + range[1];

        // Toolbar: own period + channel, like the web
        LinearLayout bar = Ui.card(h);
        bar.addView(Ui.cardHead(h, "Kỳ sản phẩm", Metrics.shortDay(range[0]) + " → " + Metrics.shortDay(range[1])
                + " · " + (Metrics.ALL.equals(h.prodChannel) ? "Tất cả kênh" : Metrics.channelLabel(h.prodChannel)), null));
        String[][] periods = {{"day", "Hôm nay"}, {"yesterday", "Hôm qua"}, {"week", "7 ngày"}, {"month", "Tháng"}, {"custom", "Tuỳ chọn…"}};
        HorizontalScrollView ps = new HorizontalScrollView(h);
        ps.setHorizontalScrollBarEnabled(false);
        LinearLayout pr = Ui.row(h);
        ps.addView(pr);
        for (int i = 0; i < periods.length; i++) {
            final String p = periods[i][0];
            TextView chip = Ui.chip(h, periods[i][1], p.equals(h.prodPeriod));
            Ui.tap(chip, () -> {
                if ("custom".equals(p)) {
                    h.pickDate(range[0], a -> h.pickDate(a.compareTo(range[1]) > 0 ? a : range[1], b -> {
                        if (a.compareTo(b) <= 0) h.setProdCustom(a, b);
                        else h.setProdCustom(b, a);
                    }));
                } else {
                    productsExpanded = false;
                    h.setProdPeriod(p);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.WRAP, Ui.dp(36));
            if (i > 0) lp.leftMargin = Ui.dp(8);
            pr.addView(chip, lp);
        }
        bar.addView(ps, Ui.block(10));

        boolean needsRemote = !h.prodInsideMain() && !key.equals(h.prodLoadedKey);
        List<Order> base = h.productBase();
        List<String> chans = Metrics.distinctSorted(Metrics.where(base, o -> {
            String d = Metrics.orderDate(o);
            return d.compareTo(range[0]) >= 0 && d.compareTo(range[1]) <= 0;
        }), o -> o.channel);
        if (!Metrics.ALL.equals(h.prodChannel) && !needsRemote && !chans.contains(h.prodChannel)) h.prodChannel = Metrics.ALL;
        HorizontalScrollView cs = new HorizontalScrollView(h);
        cs.setHorizontalScrollBarEnabled(false);
        LinearLayout cr = Ui.row(h);
        cs.addView(cr);
        List<String> chanVals = new ArrayList<>();
        chanVals.add(Metrics.ALL);
        chanVals.addAll(chans);
        for (int i = 0; i < chanVals.size(); i++) {
            final String ch = chanVals.get(i);
            TextView chip = Ui.chip(h, Metrics.ALL.equals(ch) ? "Tất cả kênh" : Metrics.channelLabel(ch), ch.equals(h.prodChannel));
            Ui.tap(chip, () -> {
                h.prodChannel = ch;
                productsExpanded = false;
                h.render();
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.WRAP, Ui.dp(34));
            if (i > 0) lp.leftMargin = Ui.dp(8);
            cr.addView(chip, lp);
        }
        bar.addView(cs);
        page.addView(bar, Ui.block(12));

        if (key.equals(h.prodLoadingKey) && !key.equals(h.prodLoadedKey)) {
            page.addView(loadingCard("Đang lấy dữ liệu Pancake cho " + Metrics.shortDay(range[0]) + " → " + Metrics.shortDay(range[1]) + "…"),
                    Ui.block(12));
            return;
        }
        if (!h.prodError.isEmpty() && needsRemote) {
            LinearLayout c = card(page, "Không tải được dữ liệu sản phẩm", null, null);
            c.addView(Ui.note(h, h.prodError, "bad"), Ui.block(10));
            TextView retry = Ui.button(h, "Thử lại", "tonal");
            Ui.tap(retry, () -> h.loadProducts(true));
            c.addView(retry, new LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(44)));
            return;
        }
        if (needsRemote) {
            page.addView(loadingCard("Khoảng " + Metrics.shortDay(range[0]) + " → " + Metrics.shortDay(range[1])
                    + " chưa có sẵn. Đang lấy trực tiếp từ Pancake…"), Ui.block(12));
            h.main.post(() -> h.loadProducts(false));
            return;
        }

        final String chSel = h.prodChannel;
        List<Order> rows = Metrics.where(base, o -> {
            String d = Metrics.orderDate(o);
            return d.compareTo(range[0]) >= 0 && d.compareTo(range[1]) <= 0 && !Metrics.isDefaultExcluded(o)
                    && (Metrics.ALL.equals(chSel) || chSel.equals(o.channel));
        });
        Metrics.ProductStats agg = Metrics.aggregateProducts(rows);
        double sold = agg.sold(), returned = agg.returned(), rate = sold > 0 ? returned / sold : 0;
        List<View> tiles = new ArrayList<>();
        tiles.add(Ui.tile(h, "Sản phẩm", Ui.num(agg.products.size()), "Mã cha có phát sinh đơn", 0, 0));
        tiles.add(Ui.tile(h, "SL bán", Ui.num(sold), "Đã phát sinh đơn", 0, 0));
        tiles.add(Ui.tile(h, "SL hoàn", Ui.num(returned), "Theo SKU hoàn", Ui.ST_RETURN, rate > .2 ? Ui.BAD : 0));
        tiles.add(Ui.tile(h, "SL bán thực", Ui.num(sold - returned), "SL bán − SL hoàn", Ui.ST_SUCCESS, 0));
        page.addView(Ui.grid(h, tiles, 2), Ui.block(8));
        page.addView(Ui.tile(h, "Tỷ lệ hoàn", Ui.pct(rate), "SL hoàn / SL bán", 0, rate > .2 ? Ui.BAD : 0), Ui.block(12));

        List<String> messages = new ArrayList<>();
        if (rows.isEmpty()) {
            int loaded = Metrics.where(base, o -> {
                String d = Metrics.orderDate(o);
                return d.compareTo(range[0]) >= 0 && d.compareTo(range[1]) <= 0;
            }).size();
            String today = Metrics.today();
            messages.add(range[0].equals(range[1]) && range[1].equals(today) && loaded == 0
                    ? "Hôm nay chưa có đơn nào trên Pancake. Bấm “Hôm qua” hoặc “7 ngày” để xem sản phẩm."
                    : "Không có đơn Ads/Live/Zalo hợp lệ trong " + Metrics.shortDay(range[0]) + " → " + Metrics.shortDay(range[1])
                    + (Metrics.ALL.equals(chSel) ? "" : " · kênh " + chSel) + " (đã tải " + Ui.num(loaded)
                    + " đơn, đơn huỷ / đơn đổi / CSKH không tính).");
        }
        if (agg.ordersWithItems == 0 && !rows.isEmpty()) {
            messages.add(Ui.num(rows.size()) + " đơn trong kỳ nhưng Pancake không trả chi tiết sản phẩm.");
        } else if (agg.ordersMissingItems > 0) {
            messages.add(Ui.num(agg.ordersMissingItems) + " đơn chưa có chi tiết sản phẩm.");
        }
        double missingCode = 0;
        for (Metrics.Product p : agg.products) if (p.code.isEmpty()) missingCode += p.sold;
        if (missingCode > 0) messages.add(Ui.num(missingCode) + " sản phẩm chưa có mã cha từ Pancake.");
        if (agg.partialUnknown > 0) {
            messages.add(Ui.num(agg.partialUnknown) + " đơn hoàn một phần chưa có SKU hoàn chi tiết — không tự gán hoàn cho toàn bộ sản phẩm.");
        }
        if (!messages.isEmpty()) page.addView(Ui.note(h, String.join(" ", messages), "warn"), Ui.block(12));

        LinearLayout list = card(page, "Top sản phẩm theo số lượng bán", "SL bán thực = SL bán − SL hoàn · xếp theo SL bán",
                Ui.pill(h, Ui.num(agg.products.size()) + " mã", Ui.ON_VARIANT, Ui.SURFACE_HIGH));
        int limit = Math.min(agg.products.size(), productsExpanded ? 100 : 20);
        if (agg.products.isEmpty()) list.addView(Ui.empty(h, "Không có dữ liệu sản phẩm trong kỳ lọc."));
        for (int i = 0; i < limit; i++) {
            if (i > 0) list.addView(Ui.divider(h));
            list.addView(productRow(i + 1, agg.products.get(i)));
        }
        if (agg.products.size() > limit) {
            TextView more = Ui.button(h, "Xem thêm (" + Math.min(100, agg.products.size()) + " mã)", "outlined");
            Ui.tap(more, () -> {
                productsExpanded = true;
                h.render();
            });
            LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(42));
            mlp.topMargin = Ui.dp(8);
            list.addView(more, mlp);
        }

        // Top 5 per channel
        page.addView(Ui.sectionHead(h, "Channel product ranking", "Top sản phẩm theo từng Kênh",
                "Top 5 mã bán nhiều nhất trong từng kênh theo kỳ đang chọn"));
        List<Object[]> channelGroups = new ArrayList<>();
        for (Map.Entry<String, List<Order>> e : Metrics.group(rows, o -> o.channel).entrySet()) {
            Metrics.ProductStats a = Metrics.aggregateProducts(e.getValue());
            if (a.sold() > 0) channelGroups.add(new Object[]{e.getKey(), e.getValue(), a});
        }
        channelGroups.sort((x, y) -> Double.compare(((Metrics.ProductStats) y[2]).sold(), ((Metrics.ProductStats) x[2]).sold()));
        if (channelGroups.isEmpty()) page.addView(Ui.empty(h, "Không có dữ liệu sản phẩm theo kênh trong kỳ lọc."));
        for (Object[] gEntry : channelGroups) {
            @SuppressWarnings("unchecked") List<Order> gr = (List<Order>) gEntry[1];
            Metrics.ProductStats a = (Metrics.ProductStats) gEntry[2];
            page.addView(groupCard(Metrics.channelLabel((String) gEntry[0]),
                    Ui.num(gr.size()) + " đơn · " + Ui.num(a.products.size()) + " mã", a), Ui.block(10));
        }

        // Top 5 per Page
        page.addView(Ui.sectionHead(h, "Page product ranking", "Top sản phẩm theo từng Page",
                "Top 5 mã từng Page · loại Đơn đổi + Live/Livestream"));
        List<Metrics.PageGroup> pages = Metrics.pageGroups(rows);
        List<Object[]> pageGroups = new ArrayList<>();
        for (Metrics.PageGroup g : pages) {
            Metrics.ProductStats a = Metrics.aggregateProducts(g.rows);
            if (a.sold() > 0) pageGroups.add(new Object[]{g, a});
        }
        pageGroups.sort((x, y) -> Double.compare(((Metrics.ProductStats) y[1]).sold(), ((Metrics.ProductStats) x[1]).sold()));
        List<String> pageNotes = new ArrayList<>();
        for (Object[] x : pageGroups) {
            Metrics.PageGroup g = (Metrics.PageGroup) x[0];
            if (Metrics.NO_PAGE.equals(g.name)) {
                pageNotes.add("Có " + Ui.num(g.rows.size()) + " đơn chưa xác định Page; sản phẩm đang gom riêng vào “" + Metrics.NO_PAGE + "”.");
            }
        }
        int live = Metrics.where(rows, o -> Metrics.isPageRelevant(o) && Metrics.isLiveSource(o)).size();
        int exchange = Metrics.where(rows, o -> Metrics.isPageRelevant(o) && Metrics.isExchange(o)).size();
        if (live > 0) pageNotes.add("Đã loại " + Ui.num(live) + " đơn Live/Livestream.");
        if (exchange > 0) pageNotes.add("Đã loại " + Ui.num(exchange) + " đơn đổi.");
        if (!pageNotes.isEmpty()) page.addView(Ui.note(h, String.join(" ", pageNotes), "info"), Ui.block(10));
        if (pageGroups.isEmpty()) page.addView(Ui.empty(h, "Không có dữ liệu sản phẩm theo Page trong kỳ lọc."));
        for (Object[] x : pageGroups) {
            Metrics.PageGroup g = (Metrics.PageGroup) x[0];
            Metrics.ProductStats a = (Metrics.ProductStats) x[1];
            page.addView(groupCard(g.name, (g.pageId.isEmpty() ? "" : "ID " + g.pageId + " · ") + Ui.num(g.rows.size())
                    + " đơn · " + Ui.num(a.products.size()) + " mã", a), Ui.block(10));
        }
    }

    private View loadingCard(String msg) {
        LinearLayout c = Ui.card(h);
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        ProgressBar pb = new ProgressBar(h);
        pb.setIndeterminate(true);
        c.addView(pb, new LinearLayout.LayoutParams(Ui.dp(36), Ui.dp(36)));
        TextView t = Ui.text(h, msg, 13, Ui.ON_VARIANT, false);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, Ui.dp(10), 0, 0);
        c.addView(t);
        return c;
    }

    private View thumb(String url, int sizeDp) {
        FrameLayout box = new FrameLayout(h);
        box.setBackground(Ui.shape(Ui.SURFACE_HIGH, 0, 12));
        box.setClipToOutline(true);
        TextView ph = Ui.text(h, "7A", 12, Ui.ON_FAINT, true);
        ph.setGravity(Gravity.CENTER);
        box.addView(ph, new FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH));
        ImageView img = new ImageView(h);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        box.addView(img, new FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH));
        ImageCache.bind(img, url);
        box.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(sizeDp), Ui.dp(sizeDp)));
        return box;
    }

    private View productRow(int rank, Metrics.Product p) {
        LinearLayout r = Ui.row(h);
        r.setGravity(Gravity.TOP);
        r.setPadding(0, Ui.dp(10), 0, Ui.dp(10));
        TextView no = Ui.text(h, String.valueOf(rank), 13, rank <= 3 ? Ui.PRIMARY : Ui.ON_FAINT, true);
        no.setGravity(Gravity.CENTER);
        r.addView(no, new LinearLayout.LayoutParams(Ui.dp(26), Ui.dp(52)));
        View t = thumb(p.imageUrl, 52);
        r.addView(t);
        LinearLayout info = Ui.column(h);
        info.setPadding(Ui.dp(12), 0, 0, 0);
        double rr = p.returnRate();
        LinearLayout titleRow = Ui.row(h);
        titleRow.addView(Ui.oneLine(Ui.text(h, p.code.isEmpty() ? "Chưa có mã" : p.code, 14.5f, Ui.ON_SURFACE, true)), Ui.weight(1));
        titleRow.addView(Ui.levelPill(h, rr > .2 ? "bad" : rr > .1 ? "warn" : "neutral", "Hoàn " + Ui.pct(rr)));
        info.addView(titleRow);
        TextView name = Ui.oneLine(Ui.text(h, p.name, 12, Ui.ON_VARIANT, false));
        name.setPadding(0, Ui.dp(2), 0, Ui.dp(8));
        info.addView(name);
        List<View> cells = new ArrayList<>();
        cells.add(Ui.stat(h, "SL bán", Ui.num(p.sold), 0));
        cells.add(Ui.stat(h, "SL hoàn", Ui.num(p.returned), p.returned > 0 ? Ui.BAD : 0));
        cells.add(Ui.stat(h, "Bán thực", Ui.num(p.net()), Ui.GOOD));
        cells.add(Ui.stat(h, "Số đơn", Ui.num(p.orders), 0));
        info.addView(Ui.grid(h, cells, 4));
        r.addView(info, Ui.weight(1));
        return r;
    }

    private View groupCard(String title, String subtitle, Metrics.ProductStats agg) {
        LinearLayout c = Ui.card(h);
        c.addView(Ui.cardHead(h, title, subtitle, Ui.pill(h, Ui.num(agg.sold()) + " SP", Ui.ON_PRIMARY_CONT, Ui.PRIMARY_CONT)));
        int n = Math.min(5, agg.products.size());
        for (int i = 0; i < n; i++) {
            Metrics.Product p = agg.products.get(i);
            if (i > 0) c.addView(Ui.divider(h));
            LinearLayout r = Ui.row(h);
            r.setPadding(0, Ui.dp(8), 0, Ui.dp(8));
            TextView no = Ui.text(h, "#" + (i + 1), 12, Ui.ON_FAINT, true);
            r.addView(no, new LinearLayout.LayoutParams(Ui.dp(28), Ui.WRAP));
            r.addView(thumb(p.imageUrl, 40));
            LinearLayout info = Ui.column(h);
            info.setPadding(Ui.dp(10), 0, Ui.dp(6), 0);
            info.addView(Ui.oneLine(Ui.text(h, p.code.isEmpty() ? "Chưa có mã" : p.code, 13.5f, Ui.ON_SURFACE, true)));
            info.addView(Ui.oneLine(Ui.text(h, p.name, 11.5f, Ui.ON_VARIANT, false)));
            r.addView(info, Ui.weight(1));
            r.addView(miniMetric(Ui.num(p.sold), "Bán", 0));
            r.addView(miniMetric(Ui.num(p.net()), "Thực", 0));
            r.addView(miniMetric(Ui.pct(p.returnRate()), "Hoàn", p.returnRate() > .2 ? Ui.BAD : 0));
            c.addView(r);
        }
        if (n == 0) c.addView(Ui.empty(h, "Không có dữ liệu sản phẩm"));
        return c;
    }

    private View miniMetric(String value, String label, int color) {
        LinearLayout m = Ui.column(h);
        m.setGravity(Gravity.END);
        m.setMinimumWidth(Ui.dp(46));
        TextView v = Ui.text(h, value, 13, color == 0 ? Ui.ON_SURFACE : color, true);
        v.setGravity(Gravity.END);
        m.addView(v, new LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP));
        TextView l = Ui.text(h, label, 10.5f, Ui.ON_FAINT, false);
        l.setGravity(Gravity.END);
        m.addView(l, new LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP));
        m.setPadding(Ui.dp(6), 0, 0, 0);
        return m;
    }

    // -------------------------------------------------------------- sales

    private static final class StaffStat {
        String name;
        Metrics.Overview k;
    }

    private void sales(LinearLayout page, List<Order> rows) {
        List<StaffStat> stats = new ArrayList<>();
        for (Map.Entry<String, List<Order>> e : Metrics.group(rows, Metrics::staffOf).entrySet()) {
            StaffStat s = new StaffStat();
            s.name = e.getKey();
            s.k = Metrics.overview(e.getValue());
            stats.add(s);
        }
        stats.sort((a, b) -> Double.compare(b.k.created, a.k.created));
        if (stats.isEmpty()) {
            page.addView(Ui.empty(h, "Không có dữ liệu Sale trong khoảng lọc."));
            return;
        }

        // Podium
        int[] podium = {0xFFFFF4F2, 0xFFF6F2EF, 0xFFF6F2EF};
        for (int i = 0; i < Math.min(3, stats.size()); i++) {
            StaffStat s = stats.get(i);
            LinearLayout c = Ui.card(h);
            c.setBackground(Ui.shape(podium[i], i == 0 ? 0xFFF2D5D1 : Ui.OUTLINE, 20));
            LinearLayout head = Ui.row(h);
            head.addView(Ui.pill(h, "#" + (i + 1) + " SALE", i == 0 ? Ui.ON_PRIMARY : Ui.ON_VARIANT, i == 0 ? Ui.PRIMARY : Ui.SURFACE_HIGHEST));
            TextView name = Ui.oneLine(Ui.text(h, s.name, 16, Ui.ON_SURFACE, true));
            name.setPadding(Ui.dp(10), 0, 0, 0);
            head.addView(name, Ui.weight(1));
            head.addView(Ui.text(h, Ui.compact(s.k.created), 18, i == 0 ? Ui.ON_PRIMARY_CONT : Ui.ON_SURFACE, true));
            c.addView(head, Ui.block(10));
            List<View> cells = new ArrayList<>();
            cells.add(Ui.stat(h, "Đơn", Ui.num(s.k.orders), 0));
            cells.add(Ui.stat(h, "Thành công", Ui.num(s.k.successOrders), Ui.GOOD));
            cells.add(Ui.stat(h, "Hoàn", Ui.pct(s.k.returnRate), s.k.returnRate > .2 ? Ui.BAD : 0));
            cells.add(Ui.stat(h, "AOV", Ui.compact(s.k.aov), 0));
            c.addView(Ui.grid(h, cells, 4));
            drill(c, "staff", s.name, "Sale · " + s.name);
            page.addView(c, Ui.block(10));
        }

        List<StaffStat> top = stats.subList(0, Math.min(12, stats.size()));
        LinearLayout rev = card(page, "Doanh số theo Sale", "Xếp hạng theo tạo đơn · tối đa 12 người", null);
        rev.addView(Ui.legend(h, new String[]{"Tạo đơn", "Thành công"}, new int[]{Ui.PRIMARY, 0x66A7192E}, null));
        List<Charts.HRow> revRows = new ArrayList<>();
        for (StaffStat s : top) {
            revRows.add(new Charts.HRow(s.name, new double[]{s.k.created, s.k.success},
                    Ui.compact(s.k.created) + " · TC " + Ui.compact(s.k.success)));
        }
        rev.addView(new Charts.HBars(h).set(revRows, new int[]{Ui.PRIMARY}, null, -1));

        LinearLayout ret = card(page, "Tỷ lệ hoàn theo Sale", "Trên 20% tô đỏ", null);
        List<Charts.HRow> retRows = new ArrayList<>();
        int[] retColors = new int[top.size()];
        for (int i = 0; i < top.size(); i++) {
            StaffStat s = top.get(i);
            retRows.add(new Charts.HRow(s.name, new double[]{s.k.returnRate * 100}, Ui.pct(s.k.returnRate)));
            retColors[i] = s.k.returnRate > .2 ? Ui.BAD : Ui.ST_TREO;
        }
        ret.addView(new Charts.HBars(h).set(retRows, new int[]{Ui.ST_TREO}, retColors, -1));

        page.addView(Ui.sectionHead(h, "Sale Online", "Bảng Sale Online", "Tạo đơn · thành công · treo · đang giao · hoàn"));
        for (StaffStat s : stats) {
            LinearLayout c = Ui.card(h);
            LinearLayout head = Ui.row(h);
            head.addView(Ui.oneLine(Ui.text(h, s.name, 15, Ui.ON_SURFACE, true)), Ui.weight(1));
            head.addView(Ui.text(h, Ui.money(s.k.created), 15, Ui.ON_SURFACE, true));
            c.addView(head, Ui.block(10));
            List<View> cells = new ArrayList<>();
            cells.add(Ui.stat(h, "Thành công", Ui.compact(s.k.success), Ui.GOOD));
            cells.add(Ui.stat(h, "Đơn", Ui.num(s.k.orders), 0));
            cells.add(Ui.stat(h, "Đơn TC", Ui.num(s.k.successOrders), 0));
            cells.add(Ui.stat(h, "Treo", Ui.compact(s.k.pending), 0));
            cells.add(Ui.stat(h, "Đang giao", Ui.compact(s.k.shipping), 0));
            cells.add(Ui.stat(h, "Hoàn", Ui.compact(s.k.returns), 0));
            cells.add(Ui.stat(h, "Tỷ lệ hoàn", Ui.pct(s.k.returnRate), s.k.returnRate > .2 ? Ui.BAD : 0));
            cells.add(Ui.stat(h, "AOV", Ui.compact(s.k.aov), 0));
            cells.add(new View(h));
            c.addView(Ui.grid(h, cells, 3));
            drill(c, "staff", s.name, "Sale · " + s.name);
            page.addView(c, Ui.block(10));
        }
    }

    // ------------------------------------------------------------ monthly

    private void monthly(LinearLayout page) {
        Filters f = h.filters;
        String sel = f.channel;
        List<String> days = h.days();
        double time = Metrics.timeProgress(days);

        LinearLayout actions = Ui.row(h);
        TextView sub = Ui.text(h, "", 13, Ui.ON_VARIANT, false);
        actions.addView(sub, Ui.weight(1));
        TextView set = Ui.button(h, "Nhập mục tiêu", "tonal");
        set.setTextSize(13);
        Ui.tap(set, h::openSettings);
        actions.addView(set, new LinearLayout.LayoutParams(Ui.WRAP, Ui.dp(40)));
        page.addView(actions, Ui.block(12));

        if (!Metrics.targetAvailable(h.store, sel)) {
            List<Order> rows = Metrics.filter(h.orders, f);
            Map<String, List<Order>> g = Metrics.group(rows, Metrics::orderDate);
            double sum = 0;
            double[] cum = new double[days.size()];
            List<String> labels = new ArrayList<>();
            for (int i = 0; i < days.size(); i++) {
                List<Order> rr = g.get(days.get(i));
                sum += rr == null ? 0 : Metrics.sumRevenue(rr);
                cum[i] = sum;
                labels.add(Metrics.shortDay(days.get(i)));
            }
            sub.setText(h.store.targetsConfigured() ? "Kênh " + sel + " chưa được cấu hình target"
                    : "Chưa nhập target theo kênh · bấm “Nhập mục tiêu”");
            List<View> tiles = new ArrayList<>();
            tiles.add(Ui.tile(h, "Target khoảng lọc", "Chưa cấu hình", "", 0, Ui.ON_FAINT));
            tiles.add(Ui.tile(h, "Đã đạt", Ui.compact(sum), Ui.money(sum), 0, 0));
            tiles.add(Ui.tile(h, "% hoàn thành", "—", "", 0, 0));
            tiles.add(Ui.tile(h, "Tiến độ thời gian", Ui.pct(time), "", 0, 0));
            page.addView(Ui.grid(h, tiles, 2), Ui.block(12));
            LinearLayout cumCard = card(page, "Lũy kế doanh số", "Thực đạt lũy kế theo ngày · chạm để xem số", null);
            List<Charts.Series> s = new ArrayList<>();
            s.add(new Charts.Series("Thực đạt", Ui.ON_SURFACE, cum, false));
            cumCard.addView(new Charts.LineChart(h).set(labels, s, Ui::money), Ui.fixed(210, 0));
            LinearLayout gap = card(page, "Chênh lệch theo ngày", null, null);
            gap.addView(Ui.note(h, "Cần nhập target theo kênh để tính chênh lệch.", "info"));
            dailyList(page, days, g, null);
            return;
        }

        List<Order> rows = Metrics.scopeForTarget(h.store, Metrics.filter(h.orders, f), sel);
        Map<String, List<Order>> g = Metrics.group(rows, Metrics::orderDate);
        double created = 0, targetSum = 0, goal = 0;
        double[] actual = new double[days.size()];
        double[] target = new double[days.size()];
        double[] diff = new double[days.size()];
        double[] dailyTargets = new double[days.size()];
        List<String> labels = new ArrayList<>();
        for (int i = 0; i < days.size(); i++) {
            String d = days.get(i);
            List<Order> rr = g.get(d);
            double c = rr == null ? 0 : Metrics.sumRevenue(rr);
            double t = Metrics.dailyTarget(h.store, d.substring(0, 7), sel);
            created += c;
            targetSum += t;
            goal += t;
            actual[i] = created;
            target[i] = targetSum;
            diff[i] = c - t;
            dailyTargets[i] = t;
            labels.add(Metrics.shortDay(d));
        }
        double completion = goal > 0 ? created / goal : 0;
        double gapPts = (completion - time) * 100;
        double forecast = time > 0 ? created / time : 0;
        sub.setText(Metrics.shortDay(f.from) + " → " + Metrics.shortDay(f.to) + " · "
                + (gapPts >= 0 ? "Vượt " : "Chậm ") + Ui.dec2(Math.abs(gapPts)) + " điểm %");

        List<View> tiles = new ArrayList<>();
        tiles.add(Ui.tile(h, "Target khoảng lọc", Ui.compact(goal), Ui.money(goal), 0, 0));
        tiles.add(Ui.tile(h, "Đã đạt", Ui.compact(created), Ui.money(created), 0, 0));
        tiles.add(Ui.tile(h, "% hoàn thành", Ui.pct(completion), "So với target khoảng lọc", 0,
                gapPts >= 0 ? Ui.GOOD : gapPts >= -10 ? Ui.WARN : Ui.BAD));
        tiles.add(Ui.tile(h, "Tiến độ thời gian", Ui.pct(time), (gapPts >= 0 ? "Vượt " : "Chậm ") + Ui.dec2(Math.abs(gapPts)) + " điểm %", 0, 0));
        page.addView(Ui.grid(h, tiles, 2), Ui.block(8));
        page.addView(Ui.tile(h, "Dự báo cuối kỳ", time > 0 ? Ui.compact(forecast) : "—",
                "Nếu giữ nhịp hiện tại", 0, forecast >= goal ? Ui.GOOD : 0), Ui.block(12));

        LinearLayout cumCard = card(page, "Lũy kế vs Target", "Thực đạt so với nhịp target theo ngày · chạm để xem số", null);
        cumCard.addView(Ui.legend(h, new String[]{"Thực đạt", "Target lũy kế"}, new int[]{Ui.ON_SURFACE, Ui.PRIMARY},
                new boolean[]{false, true}));
        List<Charts.Series> series = new ArrayList<>();
        series.add(new Charts.Series("Thực đạt", Ui.ON_SURFACE, actual, false));
        series.add(new Charts.Series("Target lũy kế", Ui.PRIMARY, target, true));
        cumCard.addView(new Charts.LineChart(h).set(labels, series, Ui::money), Ui.fixed(220, 0));

        LinearLayout gapCard = card(page, "Chênh lệch theo ngày", "So với target ngày · chạm cột để xem số", null);
        gapCard.addView(Ui.legend(h, new String[]{"Vượt", "Thiếu"}, new int[]{Ui.GOOD, Ui.BAD}, null));
        gapCard.addView(new Charts.GapBars(h).set(labels, diff), Ui.fixed(190, 0));

        dailyList(page, days, g, dailyTargets);
    }

    private void dailyList(LinearLayout page, List<String> days, Map<String, List<Order>> g, double[] targets) {
        LinearLayout c = card(page, "Chi tiết ngày", "Doanh số từng ngày và gap so với target/ngày", null);
        if (days.isEmpty()) c.addView(Ui.empty(h, "Khoảng ngày không hợp lệ."));
        for (int i = days.size() - 1; i >= 0; i--) {
            String d = days.get(i);
            List<Order> rr = g.get(d);
            Metrics.Overview k = Metrics.overview(rr == null ? new ArrayList<>() : rr);
            LinearLayout r = Ui.column(h);
            r.setPadding(0, Ui.dp(10), 0, Ui.dp(10));
            LinearLayout top = Ui.row(h);
            top.addView(Ui.text(h, Metrics.shortDay(d), 14, Ui.ON_SURFACE, true), new LinearLayout.LayoutParams(Ui.dp(56), Ui.WRAP));
            top.addView(Ui.text(h, Ui.money(k.created), 14, Ui.ON_SURFACE, true), Ui.weight(1));
            if (targets != null) {
                double gap = targets[i] - k.created;
                String label = gap > 0 ? "GAP " + Ui.compact(gap) : gap < 0 ? "Vượt " + Ui.compact(-gap) : "Đạt";
                top.addView(Ui.levelPill(h, gap > 0 ? "bad" : "good", label));
            }
            r.addView(top);
            String meta = "TC " + Ui.compact(k.success) + " · " + k.orders + " đơn";
            if (targets != null) {
                meta += " · target " + Ui.compact(targets[i]) + " · đạt " + Ui.pct(targets[i] > 0 ? k.created / targets[i] : 0);
            }
            TextView m = Ui.text(h, meta, 12, Ui.ON_VARIANT, false);
            m.setPadding(Ui.dp(56), Ui.dp(3), 0, 0);
            r.addView(m);
            if (i < days.size() - 1) c.addView(Ui.divider(h));
            c.addView(r);
        }
    }
}
