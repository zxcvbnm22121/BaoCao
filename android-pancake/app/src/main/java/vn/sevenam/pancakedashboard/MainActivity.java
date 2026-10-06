package vn.sevenam.pancakedashboard;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.Build;
import android.graphics.Insets;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.ArrayAdapter;
import android.widget.TextView;
import android.widget.Toast;

import java.text.NumberFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int RED = Color.rgb(167, 25, 46);
    private static final int RED_DARK = Color.rgb(125, 16, 32);
    private static final int INK = Color.rgb(25, 24, 23);
    private static final int MUTED = Color.rgb(122, 115, 108);
    private static final int BG = Color.rgb(245, 242, 238);
    private static final int CARD = Color.WHITE;
    private static final int LINE = Color.rgb(229, 223, 215);
    private static final int GREEN = Color.rgb(37, 118, 77);
    private static final int ORANGE = Color.rgb(182, 107, 18);
    private static final int BLUE = Color.rgb(46, 98, 167);

    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Bangkok");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final NumberFormat VN_NUM = NumberFormat.getNumberInstance(new Locale("vi", "VN"));

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private SharedPreferences prefs;
    private DashboardData dashboard;
    private String livePassword;

    private LinearLayout root;
    private LinearLayout content;
    private TextView titleView;
    private TextView liveChip;
    private TextView updatedView;
    private final List<TextView> navItems = new ArrayList<>();

    private String currentView = "overview";
    private String fromDate;
    private String toDate;
    private String channelFilter = "Tất cả";
    private String staffFilter = "Tất cả";
    private String statusFilter = "Tất cả";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("sevenam_native_dashboard", MODE_PRIVATE);

        LocalDate today = LocalDate.now(VN_ZONE);
        fromDate = today.format(ISO);
        toDate = fromDate;

        getWindow().setStatusBarColor(Color.rgb(20, 20, 20));
        getWindow().setNavigationBarColor(Color.rgb(20, 20, 20));
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        buildShell();
        renderCurrentView();
    }

    private void buildShell() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(12), dp(8), dp(12), dp(6));
        setContentView(root);

        // Android 15 enforces edge-to-edge for targetSdk 35. Handle the
        // system bars explicitly so the dashboard never sits under them.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        }
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top;
            int bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top;
                bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(dp(12), top + dp(8), dp(12), bottom + dp(5));
            return insets;
        });
        root.requestApplyInsets();

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(0, dp(1), 0, dp(8));
        root.addView(header, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        LinearLayout headerText = new LinearLayout(this);
        headerText.setOrientation(LinearLayout.VERTICAL);
        header.addView(headerText, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        TextView eyebrow = text("SEVEN.AM · PANCAKE", 9.5f, RED, true);
        eyebrow.setLetterSpacing(.08f);
        headerText.addView(eyebrow);

        titleView = text("Tổng quan doanh thu", 21, INK, true);
        titleView.setPadding(0, dp(2), 0, 0);
        headerText.addView(titleView);

        LinearLayout headerActions = new LinearLayout(this);
        headerActions.setOrientation(LinearLayout.HORIZONTAL);
        headerActions.setGravity(Gravity.CENTER_VERTICAL);
        header.addView(headerActions);

        liveChip = actionText("MỞ LIVE", false);
        liveChip.setOnClickListener(v -> showUnlockDialog());
        headerActions.addView(liveChip, actionLp(dp(82)));

        TextView refresh = actionText("↻", false);
        refresh.setTextSize(20);
        refresh.setOnClickListener(v -> {
            if (livePassword == null || livePassword.isEmpty()) {
                showUnlockDialog();
            } else {
                reloadLive(false, null, null);
            }
        });
        LinearLayout.LayoutParams refreshLp = actionLp(dp(44));
        refreshLp.leftMargin = dp(7);
        headerActions.addView(refresh, refreshLp);

        LinearLayout quickActions = new LinearLayout(this);
        quickActions.setOrientation(LinearLayout.HORIZONTAL);
        quickActions.setPadding(0, 0, 0, dp(8));
        root.addView(quickActions, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        TextView filter = bigAction("☰  Bộ lọc", false);
        filter.setOnClickListener(v -> showFilterDialog());
        quickActions.addView(filter, new LinearLayout.LayoutParams(0, dp(48), 1f));

        TextView quick = bigAction("▣  Báo cáo nhanh", true);
        quick.setOnClickListener(v -> showQuickReport());
        LinearLayout.LayoutParams quickLp = new LinearLayout.LayoutParams(0, dp(48), 1f);
        quickLp.leftMargin = dp(8);
        quickActions.addView(quick, quickLp);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
        ));

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, dp(1), 0, dp(16));
        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));

        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.HORIZONTAL);
        bottom.setGravity(Gravity.CENTER);
        bottom.setBackground(rounded(Color.rgb(24, 23, 22), Color.TRANSPARENT, 0, 22));
        bottom.setPadding(dp(5), dp(5), dp(5), dp(5));
        LinearLayout.LayoutParams bottomLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(68)
        );
        bottomLp.bottomMargin = dp(3);
        root.addView(bottom, bottomLp);

        addNav(bottom, "▦", "Hôm nay", "overview");
        addNav(bottom, "◫", "Theo kênh", "channels");
        addNav(bottom, "◎", "Sale", "sales");
        addNav(bottom, "◒", "Tháng", "monthly");
        updateNav();
    }

    private void addNav(LinearLayout bar, String icon, String label, String view) {
        TextView item = new TextView(this);
        item.setText(icon + "\n" + label);
        item.setGravity(Gravity.CENTER);
        item.setTextSize(10);
        item.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        item.setLineSpacing(dp(2), 1f);
        item.setTag(view);
        item.setOnClickListener(v -> {
            currentView = String.valueOf(v.getTag());
            updateNav();
            renderCurrentView();
        });
        navItems.add(item);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f);
        lp.setMargins(dp(2), 0, dp(2), 0);
        bar.addView(item, lp);
    }

    private void updateNav() {
        for (TextView item : navItems) {
            boolean active = currentView.equals(String.valueOf(item.getTag()));
            item.setTextColor(active ? Color.WHITE : Color.rgb(145, 139, 134));
            item.setBackground(active
                    ? rounded(Color.rgb(49, 47, 45), Color.TRANSPARENT, 0, 15)
                    : null);
        }
    }

    private void renderCurrentView() {
        content.removeAllViews();

        String title;
        if ("channels".equals(currentView)) title = "Hiệu quả theo kênh";
        else if ("sales".equals(currentView)) title = "Sale Online";
        else if ("monthly".equals(currentView)) title = "Tiến độ tháng";
        else title = "Hôm nay";
        titleView.setText(title);

        addPeriodHeader();

        if (dashboard == null) {
            addLockedState();
            return;
        }

        if ("channels".equals(currentView)) renderChannels();
        else if ("sales".equals(currentView)) renderSales();
        else if ("monthly".equals(currentView)) renderMonthly();
        else renderOverview();

        updatedView = text(formatUpdated(), 11, MUTED, false);
        updatedView.setGravity(Gravity.CENTER);
        updatedView.setPadding(0, dp(18), 0, dp(8));
        content.addView(updatedView);
    }

    private void addPeriodHeader() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.HORIZONTAL);
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setPadding(dp(12), dp(9), dp(12), dp(9));
        box.setBackground(rounded(Color.rgb(241, 238, 234), Color.rgb(229, 224, 218), 1, 18));

        boolean todayView = "overview".equals(currentView);
        String today = LocalDate.now(VN_ZONE).format(ISO);
        String periodText = todayView ? today : fromDate + "  →  " + toDate;

        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        TextView period = text(periodText, 11, INK, true);
        left.addView(period);

        String summary;
        if (dashboard == null) {
            summary = "Chưa mở dữ liệu LIVE";
        } else if (todayView) {
            summary = num(defaultRowsForDate(today).size()) + " đơn · toàn kênh hôm nay";
        } else {
            summary = num(filteredRows().size()) + " đơn · đã loại Huỷ/Xoá + Đơn đổi";
        }

        TextView sub = text(summary, 9, MUTED, false);
        sub.setPadding(0, dp(2), 0, 0);
        left.addView(sub);

        box.addView(left, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        TextView badge = text(dashboard == null ? "LOCKED" : "LIVE", 9, dashboard == null ? MUTED : GREEN, true);
        badge.setGravity(Gravity.CENTER);
        badge.setPadding(dp(9), dp(5), dp(9), dp(5));
        badge.setBackground(rounded(Color.WHITE, dashboard == null ? LINE : Color.rgb(199, 226, 211), 1, 13));
        box.addView(badge);

        LinearLayout.LayoutParams lp = fullLp();
        lp.bottomMargin = dp(9);
        content.addView(box, lp);
    }

    private void addLockedState() {
        LinearLayout locked = card();
        locked.setGravity(Gravity.CENTER_HORIZONTAL);
        locked.setPadding(dp(20), dp(22), dp(20), dp(22));

        TextView icon = text("🔒", 32, INK, false);
        icon.setGravity(Gravity.CENTER);
        locked.addView(icon);

        TextView h = text("Mở dữ liệu Pancake LIVE", 17, INK, true);
        h.setGravity(Gravity.CENTER);
        h.setPadding(0, dp(8), 0, 0);
        locked.addView(h);

        TextView p = text("Nhập mật khẩu dashboard để app tải và giải mã dữ liệu trực tiếp.", 11, MUTED, false);
        p.setGravity(Gravity.CENTER);
        p.setPadding(0, dp(6), 0, dp(14));
        locked.addView(p);

        TextView open = bigAction("MỞ LIVE", true);
        open.setGravity(Gravity.CENTER);
        open.setOnClickListener(v -> showUnlockDialog());
        locked.addView(open, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(48)
        ));

        content.addView(locked, fullLp());
    }

    private void renderOverview() {
        String today = LocalDate.now(VN_ZONE).format(ISO);
        List<Order> rows = defaultRowsForDate(today);
        Stats s = stats(rows);

        double adsRevenue = revenueForChannel(rows, "Facebook Ads");
        double liveRevenue = revenueForChannel(rows, "Livestream");
        double dailyTarget = targetMonth() / YearMonth.now(VN_ZONE).lengthOfMonth();
        double remaining = Math.max(0, dailyTarget - s.createdRevenue);

        addPrimaryKpi("DOANH SỐ HÔM NAY", compact(s.createdRevenue),
                num(s.orders) + " đơn · toàn kênh sau chiết khấu");

        addKpiPair(
                kpi("TARGET HÔM NAY", compact(dailyTarget),
                        s.createdRevenue >= dailyTarget ? "Đã đạt target ngày" : "Mục tiêu bình quân ngày"),
                kpi("CÒN THIẾU", compact(remaining),
                        s.createdRevenue >= dailyTarget ? "Đã vượt target" : "Để đạt target hôm nay")
        );

        addKpiPair(
                kpi("ADS", compact(adsRevenue), num(orderCountForChannel(rows, "Facebook Ads")) + " đơn"),
                kpi("LIVE", compact(liveRevenue), num(orderCountForChannel(rows, "Livestream")) + " đơn")
        );

        addSmartAlerts(rows);

        addSectionTitle("SO SÁNH NHANH", "Hôm qua và cùng ngày tuần trước");
        addComparisonBoard(rows);

        addKpiPair(
                kpi("THÀNH CÔNG", compact(s.successfulRevenue), num(s.successfulOrders) + " đơn"),
                kpi("ĐANG GIAO", compact(s.shippingRevenue), "Đơn đang vận chuyển")
        );
        addKpiPair(
                kpi("TREO", compact(s.pendingRevenue), "Mới / chờ / xác nhận"),
                kpi("HOÀN", compact(s.returnRevenue), "Tỷ lệ " + pct(s.returnRate))
        );

        double totalData = totalManualDataForRange(rows, today, today);
        addKpiPair(
                kpi("TỔNG DATA", totalData > 0 ? num(totalData) : "Chưa nhập",
                        totalData > 0 ? "CR " + pct(s.orders / totalData) : "Nhập tại Theo kênh"),
                kpi("CR CHỐT", totalData > 0 ? pct(s.orders / totalData) : "—",
                        totalData > 0 ? num(s.orders) + " đơn / " + num(totalData) + " data" : "Chưa có data")
        );

        addSectionTitle("TRẠNG THÁI", "Phân bổ doanh số hôm nay");
        addStatusBoard(rows);

        addSectionTitle("DOANH SỐ KÊNH", "Top kênh hôm nay");
        addChannelSummary(rows);

        addSectionTitle("TIẾN ĐỘ MỤC TIÊU", "Theo tháng hiện tại");
        addTargetBoard();
    }

    private void addStatusBoard(List<Order> rows) {
        String[] keys = {"TREO", "DANG_GIAO", "THANH_CONG", "HOAN"};
        String[] labels = {"Treo", "Đang giao", "Thành công", "Hoàn"};
        int[] colors = {ORANGE, BLUE, GREEN, RED};
        double total = 0;
        for (Order o : rows) total += o.netAmount;
        total = Math.max(1, total);

        LinearLayout board = card();
        board.setPadding(dp(13), dp(6), dp(13), dp(9));
        for (int i = 0; i < keys.length; i++) {
            final String key = keys[i];
            List<Order> rr = new ArrayList<>();
            double value = 0;
            for (Order o : rows) if (key.equals(o.status)) { rr.add(o); value += o.netAmount; }

            LinearLayout top = new LinearLayout(this);
            top.setOrientation(LinearLayout.HORIZONTAL);
            top.setGravity(Gravity.CENTER_VERTICAL);
            top.setPadding(0, dp(6), 0, dp(3));
            TextView l = text(labels[i], 11, INK, true);
            TextView v = text(compact(value) + "  ·  " + rr.size() + " đơn", 10, MUTED, true);
            v.setGravity(Gravity.END);
            top.addView(l, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            top.addView(v);
            board.addView(top);

            ProgressBar p = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
            p.setMax(1000);
            p.setProgress((int) Math.min(1000, Math.round(value / total * 1000)));
            p.setProgressTintList(android.content.res.ColorStateList.valueOf(colors[i]));
            p.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(238, 233, 227)));
            board.addView(p, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(7)
            ));
        }
        content.addView(board, fullLp());
    }

    private void addChannelSummary(List<Order> rows) {
        List<NamedStats> groups = channelGroups(rows);
        int limit = Math.min(5, groups.size());
        for (int i = 0; i < limit; i++) {
            NamedStats n = groups.get(i);
            LinearLayout box = compactCard();
            TextView name = text(n.name, 13, INK, true);
            TextView val = text(compact(n.stats.createdRevenue), 16.5f, RED, true);
            TextView sub = text(num(n.stats.orders) + " đơn · TC " + compact(n.stats.successfulRevenue), 9, MUTED, false);
            sub.setPadding(0, dp(4), 0, 0);
            box.addView(name);
            box.addView(val);
            box.addView(sub);
            LinearLayout.LayoutParams lp = fullLp();
            lp.bottomMargin = dp(8);
            content.addView(box, lp);
        }
    }

    private void addTargetBoard() {
        String month = fromDate.substring(0, 7);
        List<Order> monthRows = filteredMonth(month);
        Stats s = stats(monthRows);
        double target = targetMonth();
        YearMonth ym = YearMonth.parse(month);
        LocalDate today = LocalDate.now(VN_ZONE);
        int elapsed = month.equals(today.format(DateTimeFormatter.ofPattern("yyyy-MM")))
                ? today.getDayOfMonth() : ym.lengthOfMonth();
        elapsed = Math.max(1, Math.min(elapsed, ym.lengthOfMonth()));
        double completion = target > 0 ? s.createdRevenue / target : 0;
        double time = elapsed / (double) ym.lengthOfMonth();
        double gapPts = (completion - time) * 100;
        double forecast = s.createdRevenue / elapsed * ym.lengthOfMonth();

        LinearLayout box = card();
        box.setPadding(dp(14), dp(12), dp(14), dp(13));
        box.addView(text("Doanh số tháng", 9, MUTED, true));
        TextView value = text(compact(s.createdRevenue), 22, INK, true);
        value.setPadding(0, dp(4), 0, dp(10));
        box.addView(value);

        box.addView(metricLine("Hoàn thành target", pct(completion), completion, RED));
        box.addView(metricLine("Tiến độ thời gian", pct(time), time, Color.GRAY));

        TextView gap = text(
                (gapPts >= 0 ? "Vượt " : "Chậm ") + oneDecimal(Math.abs(gapPts)) + " điểm %",
                13, gapPts >= 0 ? GREEN : RED, true
        );
        gap.setPadding(0, dp(12), 0, dp(4));
        box.addView(gap);
        box.addView(text("Target " + compact(target) + " · Dự báo " + compact(forecast), 12, MUTED, false));

        content.addView(box, fullLp());
    }

    private View metricLine(String label, String value, double progress, int color) {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setPadding(0, dp(4), 0, dp(8));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        TextView l = text(label, 12, INK, false);
        TextView v = text(value, 11, INK, true);
        v.setGravity(Gravity.END);
        top.addView(l, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        top.addView(v);
        wrap.addView(top);

        ProgressBar p = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        p.setMax(1000);
        p.setProgress((int) Math.min(1000, Math.round(progress * 1000)));
        p.setProgressTintList(android.content.res.ColorStateList.valueOf(color));
        p.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(238, 233, 227)));
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(7));
        pp.topMargin = dp(6);
        wrap.addView(p, pp);
        return wrap;
    }

    private void renderChannels() {
        List<Order> rows = filteredRows();
        List<NamedStats> groups = channelGroups(rows);

        addSectionTitle("THEO KÊNH", "Data nhập tay được lưu theo đúng khoảng ngày");

        if (groups.isEmpty()) {
            addEmpty("Không có dữ liệu kênh");
            return;
        }

        for (NamedStats n : groups) {
            LinearLayout box = card();
            box.setPadding(dp(14), dp(12), dp(14), dp(12));

            LinearLayout head = new LinearLayout(this);
            head.setOrientation(LinearLayout.HORIZONTAL);
            head.setGravity(Gravity.CENTER_VERTICAL);
            TextView name = text(n.name, 15.5f, INK, true);
            TextView revenue = text(compact(n.stats.createdRevenue), 17, RED, true);
            revenue.setGravity(Gravity.END);
            head.addView(name, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            head.addView(revenue);
            box.addView(head);

            box.addView(infoPairRow(
                    "Thành công", compact(n.stats.successfulRevenue),
                    "Số đơn", num(n.stats.orders)
            ));
            box.addView(infoPairRow(
                    "AOV", compact(n.stats.aov),
                    "Tỷ lệ hoàn", pct(n.stats.returnRate)
            ));

            LinearLayout dataRow = new LinearLayout(this);
            dataRow.setOrientation(LinearLayout.HORIZONTAL);
            dataRow.setGravity(Gravity.CENTER_VERTICAL);
            dataRow.setPadding(0, dp(6), 0, 0);
            TextView dl = text("Data", 12, MUTED, true);
            EditText input = new EditText(this);
            input.setTextSize(16);
            input.setSingleLine(true);
            input.setInputType(InputType.TYPE_CLASS_NUMBER);
            input.setImeOptions(EditorInfo.IME_ACTION_DONE);
            input.setPadding(dp(10), dp(8), dp(10), dp(8));
            input.setBackground(rounded(Color.WHITE, LINE, 1, 10));
            double dataValue = manualData(n.name);
            if (dataValue > 0) input.setText(String.valueOf((long) dataValue));

            TextView cr = text(dataValue > 0 ? pct(n.stats.orders / dataValue) : "—", 16, INK, true);
            cr.setGravity(Gravity.END);

            dataRow.addView(dl, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, .6f));
            dataRow.addView(input, new LinearLayout.LayoutParams(0, dp(46), 1f));
            LinearLayout.LayoutParams crLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, .7f);
            crLp.leftMargin = dp(10);
            dataRow.addView(cr, crLp);
            box.addView(dataRow);

            input.setOnEditorActionListener((v, actionId, event) -> {
                saveChannelData(n.name, parseDouble(input.getText().toString()));
                cr.setText(manualData(n.name) > 0 ? pct(n.stats.orders / manualData(n.name)) : "—");
                input.clearFocus();
                return true;
            });
            input.setOnFocusChangeListener((v, hasFocus) -> {
                if (!hasFocus) {
                    saveChannelData(n.name, parseDouble(input.getText().toString()));
                    cr.setText(manualData(n.name) > 0 ? pct(n.stats.orders / manualData(n.name)) : "—");
                }
            });

            LinearLayout.LayoutParams lp = fullLp();
            lp.bottomMargin = dp(10);
            content.addView(box, lp);
        }
    }

    private void renderSales() {
        List<Order> rows = filteredRows();
        Map<String, List<Order>> grouped = new LinkedHashMap<>();
        for (Order o : rows) grouped.computeIfAbsent(o.salesStaff, k -> new ArrayList<>()).add(o);

        List<NamedStats> sales = new ArrayList<>();
        for (Map.Entry<String, List<Order>> e : grouped.entrySet()) {
            sales.add(new NamedStats(e.getKey(), stats(e.getValue())));
        }
        sales.sort((a, b) -> Double.compare(b.stats.createdRevenue, a.stats.createdRevenue));

        addSectionTitle("SALE ONLINE", "Doanh số · thành công · hoàn · AOV");
        if (sales.isEmpty()) {
            addEmpty("Không có dữ liệu Sale");
            return;
        }

        addSalesPodium(sales);

        int rank = 1;
        for (NamedStats n : sales) {
            LinearLayout box = card();
            box.setPadding(dp(15), dp(14), dp(15), dp(14));

            LinearLayout head = new LinearLayout(this);
            head.setOrientation(LinearLayout.HORIZONTAL);
            TextView name = text("#" + rank + "  " + n.name, 15.5f, INK, true);
            TextView rev = text(compact(n.stats.createdRevenue), 17, RED, true);
            rev.setGravity(Gravity.END);
            head.addView(name, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            head.addView(rev);
            box.addView(head);

            box.addView(infoPairRow(
                    "Thành công", compact(n.stats.successfulRevenue),
                    "Đơn TC", num(n.stats.successfulOrders)
            ));
            box.addView(infoPairRow(
                    "Treo", compact(n.stats.pendingRevenue),
                    "Đang giao", compact(n.stats.shippingRevenue)
            ));
            box.addView(infoPairRow(
                    "Hoàn", compact(n.stats.returnRevenue),
                    "AOV", compact(n.stats.aov)
            ));

            LinearLayout.LayoutParams lp = fullLp();
            lp.bottomMargin = dp(10);
            content.addView(box, lp);
            rank++;
        }
    }

    private void renderMonthly() {
        String month = fromDate.substring(0, 7);
        YearMonth ym = YearMonth.parse(month);
        LocalDate today = LocalDate.now(VN_ZONE);
        int lastDay = month.equals(today.format(DateTimeFormatter.ofPattern("yyyy-MM")))
                ? today.getDayOfMonth() : ym.lengthOfMonth();

        List<Order> monthRows = filteredMonth(month);
        Stats total = stats(monthRows);
        double target = targetMonth();
        double completion = target > 0 ? total.createdRevenue / target : 0;
        double time = lastDay / (double) ym.lengthOfMonth();
        double forecast = lastDay > 0 ? total.createdRevenue / lastDay * ym.lengthOfMonth() : 0;

        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout textWrap = new LinearLayout(this);
        textWrap.setOrientation(LinearLayout.VERTICAL);
        textWrap.addView(text("TIẾN ĐỘ " + month, 11, RED, true));
        textWrap.addView(text("Theo dõi target tháng", 20, INK, true));
        titleRow.addView(textWrap, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView edit = actionText("Chỉnh mục tiêu", false);
        edit.setOnClickListener(v -> showTargetDialog());
        titleRow.addView(edit, actionLp(dp(118)));
        LinearLayout.LayoutParams titleLp = fullLp();
        titleLp.bottomMargin = dp(10);
        content.addView(titleRow, titleLp);

        addKpiPair(
                kpi("TARGET THÁNG", compact(target), ""),
                kpi("ĐÃ ĐẠT", compact(total.createdRevenue), pct(completion))
        );
        addKpiPair(
                kpi("THỜI GIAN", pct(time), lastDay + "/" + ym.lengthOfMonth() + " ngày"),
                kpi("DỰ BÁO", compact(forecast), "Cuối tháng")
        );

        addSectionTitle("CHI TIẾT NGÀY", "Doanh số và gap so với target/ngày");
        double dailyTarget = target > 0 ? target / ym.lengthOfMonth() : 0;

        for (int d = lastDay; d >= 1; d--) {
            String day = month + "-" + String.format(Locale.US, "%02d", d);
            List<Order> rr = new ArrayList<>();
            for (Order o : monthRows) if (day.equals(o.createdDate)) rr.add(o);
            Stats s = stats(rr);
            double gap = s.createdRevenue - dailyTarget;

            LinearLayout box = compactCard();
            LinearLayout head = new LinearLayout(this);
            head.setOrientation(LinearLayout.HORIZONTAL);
            TextView date = text(String.format(Locale.US, "%02d", d) + "/" + month.substring(5), 13, INK, true);
            TextView revenue = text(compact(s.createdRevenue), 15.5f, RED, true);
            revenue.setGravity(Gravity.END);
            head.addView(date, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            head.addView(revenue);
            box.addView(head);

            String line = num(s.orders) + " đơn · TC " + compact(s.successfulRevenue)
                    + " · Gap " + (gap >= 0 ? "+" : "") + compact(gap);
            TextView sub = text(line, 11, gap >= 0 ? GREEN : MUTED, false);
            sub.setPadding(0, dp(5), 0, 0);
            box.addView(sub);

            LinearLayout.LayoutParams lp = fullLp();
            lp.bottomMargin = dp(8);
            content.addView(box, lp);
        }
    }

    private void showUnlockDialog() {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setPadding(dp(4), dp(4), dp(4), 0);

        TextView note = text("Dữ liệu được tải từ Pancake và giải mã trực tiếp trên điện thoại.", 13, MUTED, false);
        note.setPadding(0, 0, 0, dp(12));
        wrap.addView(note);

        EditText password = new EditText(this);
        password.setTextSize(17);
        password.setSingleLine(true);
        password.setHint("Mật khẩu dashboard");
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        password.setPadding(dp(12), dp(10), dp(12), dp(10));
        password.setBackground(rounded(Color.WHITE, LINE, 1, 11));
        wrap.addView(password, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52)
        ));

        TextView error = text("", 12, RED, false);
        error.setPadding(0, dp(9), 0, 0);
        wrap.addView(error);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Mở dữ liệu LIVE")
                .setView(wrap)
                .setNegativeButton("Đóng", null)
                .setPositiveButton("Mở LIVE", null)
                .create();

        dialog.setOnShowListener(d -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(RED);
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                String pwd = password.getText().toString();
                if (pwd.isEmpty()) {
                    error.setText("Nhập mật khẩu dashboard.");
                    return;
                }
                error.setText("Đang tải và giải mã dữ liệu...");
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
                reloadLive(true, () -> dialog.dismiss(), msg -> {
                    error.setText(msg);
                    dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                }, pwd);
            });
        });
        dialog.getWindow();
        dialog.show();
        styleDialog(dialog);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE |
                    WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN
            );
        }
    }

    private interface ErrorCallback { void onError(String message); }

    private void reloadLive(boolean unlock, Runnable onSuccess, ErrorCallback onError) {
        reloadLive(unlock, onSuccess, onError, livePassword);
    }

    private void reloadLive(boolean unlock, Runnable onSuccess, ErrorCallback onError, String password) {
        if (password == null || password.isEmpty()) {
            if (onError != null) onError.onError("Chưa có mật khẩu.");
            return;
        }
        liveChip.setText("ĐANG TẢI");
        executor.submit(() -> {
            try {
                DashboardData result = CryptoLoader.load(password);
                runOnUiThread(() -> {
                    dashboard = result;
                    livePassword = password;
                    liveChip.setText("LIVE");
                    liveChip.setTextColor(GREEN);
                    liveChip.setBackground(rounded(Color.rgb(234, 246, 239), Color.rgb(205, 232, 216), 1, 12));
                    renderCurrentView();
                    Toast.makeText(this, "Đã cập nhật Pancake LIVE", Toast.LENGTH_SHORT).show();
                    if (onSuccess != null) onSuccess.run();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    liveChip.setText(dashboard == null ? "MỞ LIVE" : "LIVE");
                    String msg = unlock
                            ? "Không mở được dữ liệu. Kiểm tra mật khẩu hoặc kết nối mạng."
                            : "Không tải được bản dữ liệu mới.";
                    if (onError != null) onError.onError(msg);
                    else Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    private void showFilterDialog() {
        final String[] tempFrom = {fromDate};
        final String[] tempTo = {toDate};

        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setPadding(dp(2), dp(2), dp(2), 0);

        LinearLayout presets = new LinearLayout(this);
        presets.setOrientation(LinearLayout.HORIZONTAL);
        wrap.addView(presets, fullLp());

        String[] presetNames = {"Hôm nay", "Hôm qua", "7 ngày", "Tháng"};
        for (String p : presetNames) {
            Button b = new Button(this);
            b.setText(p);
            b.setTextSize(11);
            b.setAllCaps(false);
            b.setMinHeight(dp(44));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(46), 1f);
            lp.setMargins(dp(2), 0, dp(2), 0);
            presets.addView(b, lp);
            b.setOnClickListener(v -> {
                LocalDate today = LocalDate.now(VN_ZONE);
                if ("Hôm qua".equals(p)) {
                    tempFrom[0] = today.minusDays(1).format(ISO);
                    tempTo[0] = tempFrom[0];
                } else if ("7 ngày".equals(p)) {
                    tempFrom[0] = today.minusDays(6).format(ISO);
                    tempTo[0] = today.format(ISO);
                } else if ("Tháng".equals(p)) {
                    tempFrom[0] = today.withDayOfMonth(1).format(ISO);
                    tempTo[0] = today.format(ISO);
                } else {
                    tempFrom[0] = today.format(ISO);
                    tempTo[0] = tempFrom[0];
                }
            });
        }

        Button fromBtn = new Button(this);
        fromBtn.setAllCaps(false);
        fromBtn.setText("Từ ngày: " + tempFrom[0]);
        fromBtn.setTextSize(14);
        LinearLayout.LayoutParams dateLp = fullLp();
        dateLp.topMargin = dp(8);
        wrap.addView(fromBtn, dateLp);

        Button toBtn = new Button(this);
        toBtn.setAllCaps(false);
        toBtn.setText("Đến ngày: " + tempTo[0]);
        toBtn.setTextSize(14);
        LinearLayout.LayoutParams dateLp2 = fullLp();
        dateLp2.topMargin = dp(5);
        wrap.addView(toBtn, dateLp2);

        fromBtn.setOnClickListener(v -> pickDate(tempFrom[0], date -> {
            tempFrom[0] = date;
            fromBtn.setText("Từ ngày: " + date);
        }));
        toBtn.setOnClickListener(v -> pickDate(tempTo[0], date -> {
            tempTo[0] = date;
            toBtn.setText("Đến ngày: " + date);
        }));

        Spinner channel = spinner(uniqueChannels());
        Spinner staff = spinner(uniqueStaff());
        Spinner status = spinner(new String[]{"Tất cả", "TREO", "DANG_GIAO", "THANH_CONG", "HOAN", "HUY"});
        setSpinner(channel, channelFilter);
        setSpinner(staff, staffFilter);
        setSpinner(status, statusFilter);

        wrap.addView(labeled("Kênh", channel));
        wrap.addView(labeled("Sale", staff));
        wrap.addView(labeled("Trạng thái", status));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Bộ lọc báo cáo")
                .setView(wrap)
                .setNegativeButton("Đóng", null)
                .setPositiveButton("Áp dụng", (d, which) -> {
                    fromDate = tempFrom[0];
                    toDate = tempTo[0];
                    channelFilter = String.valueOf(channel.getSelectedItem());
                    staffFilter = String.valueOf(staff.getSelectedItem());
                    statusFilter = String.valueOf(status.getSelectedItem());
                    renderCurrentView();
                })
                .create();
        dialog.show();
        styleDialog(dialog);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(RED);
    }

    private interface DateCallback { void onDate(String date); }

    private void pickDate(String current, DateCallback cb) {
        LocalDate d = LocalDate.parse(current);
        DatePickerDialog picker = new DatePickerDialog(
                this,
                (view, year, month, day) -> cb.onDate(LocalDate.of(year, month + 1, day).format(ISO)),
                d.getYear(), d.getMonthValue() - 1, d.getDayOfMonth()
        );
        picker.show();
    }

    private List<Order> defaultRowsForDate(String date) {
        List<Order> out = new ArrayList<>();
        if (dashboard == null) return out;
        for (Order o : dashboard.orders) {
            if (!date.equals(o.createdDate)) continue;
            if (o.excludedFromDefaultReport) continue;
            out.add(o);
        }
        return out;
    }

    private List<Order> defaultRowsForMonth(String month) {
        List<Order> out = new ArrayList<>();
        if (dashboard == null) return out;
        for (Order o : dashboard.orders) {
            if (!o.createdDate.startsWith(month)) continue;
            if (o.excludedFromDefaultReport) continue;
            out.add(o);
        }
        return out;
    }

    private boolean hasAnyDataForDate(String date) {
        if (dashboard == null) return false;
        for (Order o : dashboard.orders) {
            if (date.equals(o.createdDate)) return true;
        }
        return false;
    }

    private double revenueForChannel(List<Order> rows, String channel) {
        double sum = 0;
        for (Order o : rows) if (channel.equals(o.channel)) sum += o.netAmount;
        return sum;
    }

    private int orderCountForChannel(List<Order> rows, String channel) {
        int count = 0;
        for (Order o : rows) if (channel.equals(o.channel)) count++;
        return count;
    }

    private double totalManualDataForRange(List<Order> rows, String from, String to) {
        Set<String> channels = new LinkedHashSet<>();
        for (Order o : rows) channels.add(o.channel);
        double sum = 0;
        for (String channel : channels) sum += manualDataForRange(channel, from, to);
        return sum;
    }

    private double manualDataForRange(String channel, String from, String to) {
        return prefs.getFloat("data|" + from + "|" + to + "|" + channel, 0);
    }

    private void addSmartAlerts(List<Order> todayRows) {
        List<String> alerts = new ArrayList<>();

        LocalDate todayDate = LocalDate.now(VN_ZONE);
        String today = todayDate.format(ISO);
        String month = today.substring(0, 7);
        List<Order> monthRows = defaultRowsForMonth(month);
        Stats monthStats = stats(monthRows);
        Stats todayStats = stats(todayRows);

        double target = targetMonth();
        double completion = target > 0 ? monthStats.createdRevenue / target : 0;
        double time = todayDate.getDayOfMonth() / (double) YearMonth.now(VN_ZONE).lengthOfMonth();
        double gapPts = (completion - time) * 100;

        if (gapPts < -10) {
            alerts.add("Doanh số tháng đang chậm " + oneDecimal(Math.abs(gapPts)) + " điểm % so với tiến độ thời gian.");
        }

        double adsData = manualDataForRange("Facebook Ads", today, today);
        int adsOrders = orderCountForChannel(todayRows, "Facebook Ads");
        if (adsData > 0 && adsOrders / adsData < .10) {
            alerts.add("CR Ads hôm nay đang dưới 10%.");
        }

        if (revenueForChannel(todayRows, "Livestream") <= 0) {
            alerts.add("Livestream hôm nay chưa ghi nhận doanh số.");
        }

        if (todayStats.returnRate > .20) {
            alerts.add("Tỷ lệ hoàn hôm nay đang trên 20%.");
        }

        addSectionTitle("CẢNH BÁO", alerts.isEmpty() ? "Chưa có cảnh báo đáng chú ý" : alerts.size() + " điểm cần chú ý");

        LinearLayout board = card();
        board.setPadding(dp(13), dp(8), dp(13), dp(8));

        if (alerts.isEmpty()) {
            TextView ok = text("✓  Các chỉ số chính đang trong ngưỡng theo dõi.", 10.5f, GREEN, true);
            ok.setPadding(0, dp(6), 0, dp(6));
            board.addView(ok);
        } else {
            for (int i = 0; i < alerts.size(); i++) {
                TextView alert = text("•  " + alerts.get(i), 10.5f, i == 0 ? RED : INK, i == 0);
                alert.setPadding(0, dp(6), 0, dp(6));
                board.addView(alert);
                if (i < alerts.size() - 1) {
                    View line = new View(this);
                    line.setBackgroundColor(Color.rgb(241, 237, 232));
                    board.addView(line, new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT, dp(1)
                    ));
                }
            }
        }
        content.addView(board, fullLp());
    }

    private void addComparisonBoard(List<Order> todayRows) {
        LocalDate today = LocalDate.now(VN_ZONE);
        String yesterdayDate = today.minusDays(1).format(ISO);
        String weekDate = today.minusDays(7).format(ISO);

        List<Order> yesterday = defaultRowsForDate(yesterdayDate);
        List<Order> week = defaultRowsForDate(weekDate);

        boolean hasYesterday = hasAnyDataForDate(yesterdayDate);
        boolean hasWeek = hasAnyDataForDate(weekDate);

        LinearLayout board = card();
        board.setPadding(dp(13), dp(8), dp(13), dp(8));

        board.addView(comparisonRow(
                "Tổng doanh số",
                stats(todayRows).createdRevenue,
                hasYesterday ? stats(yesterday).createdRevenue : null,
                hasWeek ? stats(week).createdRevenue : null
        ));
        board.addView(comparisonRow(
                "Facebook Ads",
                revenueForChannel(todayRows, "Facebook Ads"),
                hasYesterday ? revenueForChannel(yesterday, "Facebook Ads") : null,
                hasWeek ? revenueForChannel(week, "Facebook Ads") : null
        ));
        board.addView(comparisonRow(
                "Livestream",
                revenueForChannel(todayRows, "Livestream"),
                hasYesterday ? revenueForChannel(yesterday, "Livestream") : null,
                hasWeek ? revenueForChannel(week, "Livestream") : null
        ));

        content.addView(board, fullLp());
    }

    private View comparisonRow(String label, double current, Double yesterday, Double week) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(0, dp(7), 0, dp(7));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        TextView name = text(label, 10.5f, MUTED, false);
        TextView value = text(compact(current), 14, INK, true);
        value.setGravity(Gravity.END);
        top.addView(name, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        top.addView(value);
        row.addView(top);

        TextView delta = text(
                "Hôm qua " + changeText(current, yesterday) + "   ·   Tuần trước " + changeText(current, week),
                9.5f, MUTED, false
        );
        delta.setPadding(0, dp(3), 0, 0);
        row.addView(delta);
        return row;
    }

    private String changeText(double current, Double previous) {
        if (previous == null) return "—";
        if (previous == 0) return current == 0 ? "0%" : "—";
        double change = (current - previous) / previous;
        return (change >= 0 ? "↑ " : "↓ ") + oneDecimal(Math.abs(change) * 100) + "%";
    }

    private void addSalesPodium(List<NamedStats> sales) {
        addSectionTitle("XẾP HẠNG", "Top Sale theo doanh số tạo đơn");

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setBaselineAligned(false);

        int limit = Math.min(3, sales.size());
        for (int i = 0; i < limit; i++) {
            NamedStats n = sales.get(i);
            LinearLayout box = card();
            box.setGravity(Gravity.CENTER_HORIZONTAL);
            box.setPadding(dp(7), dp(10), dp(7), dp(10));

            TextView rank = text("#" + (i + 1), 9, i == 0 ? RED : MUTED, true);
            rank.setGravity(Gravity.CENTER);
            box.addView(rank);

            TextView name = text(n.name, 11.5f, INK, true);
            name.setGravity(Gravity.CENTER);
            name.setMaxLines(1);
            name.setPadding(0, dp(4), 0, 0);
            box.addView(name);

            TextView rev = text(compact(n.stats.createdRevenue), 13.5f, INK, true);
            rev.setGravity(Gravity.CENTER);
            rev.setPadding(0, dp(5), 0, 0);
            box.addView(rev);

            double tcRate = n.stats.orders > 0
                    ? n.stats.successfulOrders / (double) n.stats.orders : 0;
            TextView sub = text(
                    num(n.stats.orders) + " đơn · TC " + pct(tcRate),
                    8.5f, MUTED, false
            );
            sub.setGravity(Gravity.CENTER);
            sub.setPadding(0, dp(3), 0, 0);
            box.addView(sub);

            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
            );
            if (i > 0) lp.leftMargin = dp(6);
            row.addView(box, lp);
        }

        LinearLayout.LayoutParams rowLp = fullLp();
        rowLp.bottomMargin = dp(10);
        content.addView(row, rowLp);
    }

    private Button reportActionButton(String label, boolean primary) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(11.5f);
        button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        button.setTextColor(primary ? Color.WHITE : INK);
        button.setBackground(rounded(
                primary ? RED : Color.WHITE,
                primary ? RED : LINE,
                1,
                14
        ));
        return button;
    }

    private void saveQuickInputs(double totalData, double adsData) {
        prefs.edit()
                .putFloat(quickTotalKey(), (float) totalData)
                .putFloat(channelDataKey("Facebook Ads"), (float) adsData)
                .apply();
    }

    private String buildQuickReportText(
            double totalData,
            double adsData,
            int adsOrders,
            double adsRevenue,
            double liveRevenue
    ) {
        return "Data mới toàn kênh: " + (totalData > 0 ? num(totalData) : "Chưa nhập") + "\n" +
                "Data Ads: " + (adsData > 0 ? num(adsData) : "Chưa nhập") + "\n" +
                "CR Ads: " + (adsData > 0 ? pct(adsOrders / adsData) : "—") + "\n" +
                "Doanh số Ads: " + money(adsRevenue) + "\n" +
                "Doanh số live: " + money(liveRevenue);
    }

    private void showQuickReport() {
        if (dashboard == null) {
            showUnlockDialog();
            return;
        }

        List<Order> rows = quickReportRows();
        int adsOrders = 0;
        double adsRevenue = 0;
        double liveRevenue = 0;
        for (Order o : rows) {
            if ("Facebook Ads".equals(o.channel)) {
                adsOrders++;
                adsRevenue += o.netAmount;
            } else if ("Livestream".equals(o.channel)) {
                liveRevenue += o.netAmount;
            }
        }

        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setPadding(dp(2), dp(2), dp(2), 0);

        EditText totalInput = numberInput();
        EditText adsInput = numberInput();
        double totalStored = prefs.getFloat(quickTotalKey(), 0);
        double adsStored = manualData("Facebook Ads");
        if (totalStored > 0) totalInput.setText(String.valueOf((long) totalStored));
        if (adsStored > 0) adsInput.setText(String.valueOf((long) adsStored));

        TextView cr = quickValue("—");
        TextView adsRev = quickValue(money(adsRevenue));
        TextView liveRev = quickValue(money(liveRevenue));

        wrap.addView(quickRow("Data mới toàn kênh:", totalInput));
        wrap.addView(quickRow("Data Ads:", adsInput));
        wrap.addView(quickRow("CR Ads:", cr));
        wrap.addView(quickRow("Doanh số Ads:", adsRev));
        wrap.addView(quickRow("Doanh số live:", liveRev));

        final int finalAdsOrders = adsOrders;
        final double finalAdsRevenue = adsRevenue;
        final double finalLiveRevenue = liveRevenue;

        Runnable updateCr = () -> {
            double data = parseDouble(adsInput.getText().toString());
            cr.setText(data > 0 ? pct(finalAdsOrders / data) : "—");
        };
        adsInput.addTextChangedListener(simpleWatcher(updateCr));
        updateCr.run();

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);

        Button copy = reportActionButton("Sao chép", false);
        Button share = reportActionButton("Chia sẻ ảnh", true);

        actions.addView(copy, new LinearLayout.LayoutParams(0, dp(48), 1f));
        LinearLayout.LayoutParams shareLp = new LinearLayout.LayoutParams(0, dp(48), 1f);
        shareLp.leftMargin = dp(8);
        actions.addView(share, shareLp);

        LinearLayout.LayoutParams ap = fullLp();
        ap.topMargin = dp(12);
        wrap.addView(actions, ap);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Báo cáo nhanh")
                .setView(wrap)
                .setNegativeButton("Đóng", null)
                .create();

        copy.setOnClickListener(v -> {
            double totalData = parseDouble(totalInput.getText().toString());
            double adsData = parseDouble(adsInput.getText().toString());
            saveQuickInputs(totalData, adsData);

            String report = buildQuickReportText(
                    totalData, adsData, finalAdsOrders, finalAdsRevenue, finalLiveRevenue
            );

            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("Báo cáo nhanh", report));
            Toast.makeText(this, "Đã sao chép báo cáo", Toast.LENGTH_SHORT).show();
        });

        share.setOnClickListener(v -> {
            double totalData = parseDouble(totalInput.getText().toString());
            double adsData = parseDouble(adsInput.getText().toString());
            saveQuickInputs(totalData, adsData);

            String report = buildQuickReportText(
                    totalData, adsData, finalAdsOrders, finalAdsRevenue, finalLiveRevenue
            );

            try {
                ReportImageSharer.share(this, report, fromDate, toDate);
            } catch (Exception e) {
                Toast.makeText(this, "Không tạo được ảnh báo cáo", Toast.LENGTH_LONG).show();
            }
        });

        dialog.show();
        styleDialog(dialog);
    }

    private void showTargetDialog() {
        EditText input = numberInput();
        input.setText(String.valueOf((long) targetMonth()));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Target tháng")
                .setView(input)
                .setNegativeButton("Đóng", null)
                .setPositiveButton("Lưu", (d, w) -> {
                    double v = parseDouble(input.getText().toString());
                    prefs.edit().putFloat("targetMonth", (float) v).apply();
                    renderCurrentView();
                })
                .create();
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(RED);
    }

    private List<Order> filteredRows() {
        List<Order> out = new ArrayList<>();
        if (dashboard == null) return out;
        for (Order o : dashboard.orders) {
            if (!o.createdDate.isEmpty()) {
                if (o.createdDate.compareTo(fromDate) < 0 || o.createdDate.compareTo(toDate) > 0) continue;
            }
            if (!"Tất cả".equals(channelFilter) && !channelFilter.equals(o.channel)) continue;
            if (!"Tất cả".equals(staffFilter) && !staffFilter.equals(o.salesStaff)) continue;
            if ("Tất cả".equals(statusFilter)) {
                if (o.excludedFromDefaultReport) continue;
            } else {
                if (o.excludedExchangeSource) continue;
                if (!statusFilter.equals(o.status)) continue;
            }
            out.add(o);
        }
        return out;
    }

    private List<Order> filteredMonth(String month) {
        List<Order> out = new ArrayList<>();
        if (dashboard == null) return out;
        for (Order o : dashboard.orders) {
            if (!o.createdDate.startsWith(month)) continue;
            if (!"Tất cả".equals(channelFilter) && !channelFilter.equals(o.channel)) continue;
            if (!"Tất cả".equals(staffFilter) && !staffFilter.equals(o.salesStaff)) continue;
            if ("Tất cả".equals(statusFilter)) {
                if (o.excludedFromDefaultReport) continue;
            } else {
                if (o.excludedExchangeSource) continue;
                if (!statusFilter.equals(o.status)) continue;
            }
            out.add(o);
        }
        return out;
    }

    private List<Order> quickReportRows() {
        List<Order> out = new ArrayList<>();
        if (dashboard == null) return out;
        for (Order o : dashboard.orders) {
            if (o.createdDate.compareTo(fromDate) < 0 || o.createdDate.compareTo(toDate) > 0) continue;
            if (o.excludedFromDefaultReport) continue;
            out.add(o);
        }
        return out;
    }

    private Stats stats(List<Order> rows) {
        Stats s = new Stats();
        for (Order o : rows) {
            s.orders++;
            s.createdRevenue += o.netAmount;
            s.grossRevenue += o.grossAmount;
            s.discountRevenue += o.discountAmount;
            s.codRevenue += o.codAmount;
            s.prepaidRevenue += o.prepaidAmount;
            s.successfulRevenue += o.successfulAmount;
            if (o.successfulAmount > 0 || "THANH_CONG".equals(o.status)) s.successfulOrders++;
            if ("TREO".equals(o.status)) s.pendingRevenue += o.netAmount;
            if ("DANG_GIAO".equals(o.status)) s.shippingRevenue += o.netAmount;
            if ("HOAN".equals(o.status)) {
                s.returnRevenue += o.netAmount;
                s.returnOrders++;
            }
        }
        s.returnRate = s.orders > 0 ? s.returnOrders / (double) s.orders : 0;
        s.aov = s.orders > 0 ? s.createdRevenue / s.orders : 0;
        return s;
    }

    private List<NamedStats> channelGroups(List<Order> rows) {
        Map<String, List<Order>> grouped = new LinkedHashMap<>();
        for (Order o : rows) grouped.computeIfAbsent(o.channel, k -> new ArrayList<>()).add(o);
        List<NamedStats> list = new ArrayList<>();
        for (Map.Entry<String, List<Order>> e : grouped.entrySet()) {
            list.add(new NamedStats(e.getKey(), stats(e.getValue())));
        }
        list.sort((a, b) -> Double.compare(b.stats.createdRevenue, a.stats.createdRevenue));
        return list;
    }

    private double totalManualData() {
        if (dashboard == null) return 0;
        Set<String> channels = new LinkedHashSet<>();
        for (Order o : filteredRows()) channels.add(o.channel);
        double sum = 0;
        for (String ch : channels) sum += manualData(ch);
        return sum;
    }

    private double manualData(String channel) {
        return prefs.getFloat(channelDataKey(channel), 0);
    }

    private void saveChannelData(String channel, double value) {
        prefs.edit().putFloat(channelDataKey(channel), (float) Math.max(0, value)).apply();
    }

    private String channelDataKey(String channel) {
        return "data|" + fromDate + "|" + toDate + "|" + channel;
    }

    private String quickTotalKey() {
        return "quick|" + fromDate + "|" + toDate;
    }

    private double targetMonth() {
        float saved = prefs.getFloat("targetMonth", -1);
        if (saved >= 0) return saved;
        return dashboard != null ? dashboard.monthlyTarget : 2_300_000_000d;
    }

    private String[] uniqueChannels() {
        Set<String> set = new LinkedHashSet<>();
        set.add("Tất cả");
        if (dashboard != null) for (Order o : dashboard.orders) set.add(o.channel);
        return set.toArray(new String[0]);
    }

    private String[] uniqueStaff() {
        Set<String> set = new LinkedHashSet<>();
        set.add("Tất cả");
        if (dashboard != null) for (Order o : dashboard.orders) set.add(o.salesStaff);
        return set.toArray(new String[0]);
    }

    private Spinner spinner(String[] values) {
        Spinner spinner = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(
                this, android.R.layout.simple_spinner_item, values
        );
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner.setAdapter(adapter);
        spinner.setPadding(dp(8), 0, dp(8), 0);
        spinner.setBackground(rounded(Color.WHITE, LINE, 1, 15));
        return spinner;
    }

    private void setSpinner(Spinner spinner, String value) {
        for (int i = 0; i < spinner.getCount(); i++) {
            if (value.equals(String.valueOf(spinner.getItemAtPosition(i)))) {
                spinner.setSelection(i);
                return;
            }
        }
    }

    private View labeled(String label, View child) {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setPadding(0, dp(10), 0, 0);
        wrap.addView(text(label.toUpperCase(Locale.ROOT), 10, MUTED, true));
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(50)
        );
        cp.topMargin = dp(5);
        wrap.addView(child, cp);
        return wrap;
    }

    private EditText numberInput() {
        EditText e = new EditText(this);
        e.setTextSize(14);
        e.setSingleLine(true);
        e.setInputType(InputType.TYPE_CLASS_NUMBER);
        e.setPadding(dp(10), dp(8), dp(10), dp(8));
        e.setBackground(rounded(Color.WHITE, LINE, 1, 15));
        return e;
    }

    private View quickRow(String label, View value) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(5), 0, dp(5));
        TextView l = text(label, 11.5f, INK, true);
        row.addView(l, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams vp = new LinearLayout.LayoutParams(dp(150), dp(48));
        row.addView(value, vp);
        return row;
    }

    private TextView quickValue(String value) {
        TextView t = text(value, 15, INK, true);
        t.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        return t;
    }

    private TextWatcher simpleWatcher(Runnable action) {
        return new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { action.run(); }
            @Override public void afterTextChanged(Editable s) {}
        };
    }

    private View infoPairRow(
            String labelA, String valueA,
            String labelB, String valueB
    ) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(7), 0, 0);

        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        TextView la = text(labelA, 9, MUTED, false);
        TextView va = text(valueA, 12, INK, true);
        va.setPadding(0, dp(2), 0, 0);
        left.addView(la);
        left.addView(va);

        LinearLayout right = new LinearLayout(this);
        right.setOrientation(LinearLayout.VERTICAL);
        right.setGravity(Gravity.END);
        TextView lb = text(labelB, 9, MUTED, false);
        lb.setGravity(Gravity.END);
        TextView vb = text(valueB, 12, INK, true);
        vb.setGravity(Gravity.END);
        vb.setPadding(0, dp(2), 0, 0);
        right.addView(lb);
        right.addView(vb);

        row.addView(left, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(right, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    private View infoRow(String label, String value) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(6), 0, 0);
        TextView l = text(label, 10, MUTED, false);
        TextView v = text(value, 12, INK, true);
        v.setGravity(Gravity.END);
        row.addView(l, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(v);
        return row;
    }

    private void addSectionTitle(String title, String subtitle) {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setPadding(dp(2), dp(14), dp(2), dp(7));
        TextView e = text(title, 9.5f, RED, true);
        e.setLetterSpacing(.06f);
        wrap.addView(e);
        wrap.addView(text(subtitle, 12, INK, true));
        content.addView(wrap);
    }

    private void addPrimaryKpi(String label, String value, String sub) {
        LinearLayout c = card();
        c.setPadding(dp(15), dp(13), dp(15), dp(13));

        LinearLayout labelRow = new LinearLayout(this);
        labelRow.setOrientation(LinearLayout.HORIZONTAL);
        labelRow.setGravity(Gravity.CENTER_VERTICAL);

        View dot = new View(this);
        dot.setBackground(rounded(RED, RED, 0, 4));
        labelRow.addView(dot, new LinearLayout.LayoutParams(dp(7), dp(7)));

        TextView l = text(label, 9, RED, true);
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        llp.leftMargin = dp(7);
        labelRow.addView(l, llp);
        c.addView(labelRow);

        TextView v = text(value, 28, INK, true);
        v.setPadding(0, dp(6), 0, dp(3));
        c.addView(v);
        c.addView(text(sub, 10, MUTED, false));

        LinearLayout.LayoutParams lp = fullLp();
        lp.bottomMargin = dp(9);
        content.addView(c, lp);
    }

    private LinearLayout kpi(String label, String value, String sub) {
        LinearLayout c = card();
        c.setMinimumHeight(dp(82));
        c.setPadding(dp(11), dp(10), dp(11), dp(9));
        c.addView(text(label, 8.5f, MUTED, true));
        TextView v = text(value, 18, INK, true);
        v.setPadding(0, dp(5), 0, dp(2));
        c.addView(v);
        if (sub != null && !sub.isEmpty()) {
            TextView s = text(sub, 8.5f, MUTED, false);
            s.setMaxLines(2);
            c.addView(s);
        }
        return c;
    }

    private void addKpiPair(View a, View b) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setBaselineAligned(false);
        LinearLayout.LayoutParams aLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        LinearLayout.LayoutParams bLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        aLp.rightMargin = dp(4);
        bLp.leftMargin = dp(4);
        row.addView(a, aLp);
        row.addView(b, bLp);
        LinearLayout.LayoutParams rp = fullLp();
        rp.bottomMargin = dp(8);
        content.addView(row, rp);
    }

    private LinearLayout card() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setBackground(rounded(CARD, Color.rgb(235, 230, 224), 1, 21));
        c.setElevation(dp(1));
        return c;
    }

    private LinearLayout compactCard() {
        LinearLayout c = card();
        c.setPadding(dp(12), dp(10), dp(12), dp(10));
        return c;
    }

    private void addEmpty(String message) {
        LinearLayout box = card();
        box.setPadding(dp(20), dp(24), dp(20), dp(24));
        TextView t = text(message, 14, MUTED, false);
        t.setGravity(Gravity.CENTER);
        box.addView(t);
        content.addView(box, fullLp());
    }

    private TextView text(String value, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setIncludeFontPadding(false);
        t.setTypeface(Typeface.create(
                bold ? "sans-serif-medium" : "sans-serif",
                Typeface.NORMAL
        ));
        return t;
    }

    private TextView actionText(String value, boolean primary) {
        TextView t = text(value, 12, primary ? Color.WHITE : INK, true);
        t.setGravity(Gravity.CENTER);
        t.setBackground(rounded(primary ? RED : Color.WHITE, primary ? RED : Color.rgb(225, 219, 213), 1, 15));
        t.setPadding(dp(8), dp(8), dp(8), dp(8));
        t.setClickable(true);
        t.setFocusable(true);
        return t;
    }

    private TextView bigAction(String value, boolean primary) {
        TextView t = actionText(value, primary);
        t.setTextSize(12);
        return t;
    }

    private void styleDialog(AlertDialog dialog) {
        if (dialog == null || dialog.getWindow() == null) return;

        dialog.getWindow().setBackgroundDrawable(
                rounded(Color.WHITE, Color.TRANSPARENT, 0, 24)
        );
        dialog.getWindow().setDimAmount(.42f);
        dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);

        int width = getResources().getDisplayMetrics().widthPixels - dp(28);
        dialog.getWindow().setLayout(width, WindowManager.LayoutParams.WRAP_CONTENT);

        int titleId = getResources().getIdentifier("alertTitle", "id", "android");
        TextView title = dialog.findViewById(titleId);
        if (title != null) {
            title.setTextSize(17);
            title.setTextColor(INK);
            title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
            title.setIncludeFontPadding(false);
        }

        TextView message = dialog.findViewById(android.R.id.message);
        if (message != null) {
            message.setTextSize(11);
            message.setTextColor(MUTED);
            message.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        }

        Button positive = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
        Button negative = dialog.getButton(AlertDialog.BUTTON_NEGATIVE);
        if (positive != null) {
            positive.setTextSize(12);
            positive.setTextColor(RED);
            positive.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        }
        if (negative != null) {
            negative.setTextSize(12);
            negative.setTextColor(MUTED);
            negative.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        }
    }

    private GradientDrawable rounded(int fill, int stroke, int strokeWidthDp, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(radiusDp));
        if (strokeWidthDp > 0) d.setStroke(dp(strokeWidthDp), stroke);
        return d;
    }

    private LinearLayout.LayoutParams fullLp() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams actionLp(int width) {
        return new LinearLayout.LayoutParams(width, dp(42));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private double parseDouble(String value) {
        try { return Double.parseDouble(value == null || value.isEmpty() ? "0" : value); }
        catch (Exception e) { return 0; }
    }

    private String money(double value) {
        return VN_NUM.format(Math.round(value)) + "đ";
    }

    private String num(double value) {
        return VN_NUM.format(Math.round(value));
    }

    private String compact(double value) {
        double abs = Math.abs(value);
        String sign = value < 0 ? "-" : "";
        if (abs >= 1_000_000_000d) {
            return sign + oneDecimal(abs / 1_000_000_000d) + " tỷ";
        }
        if (abs >= 1_000_000d) {
            return sign + oneDecimal(abs / 1_000_000d) + "tr";
        }
        return sign + VN_NUM.format(Math.round(abs)) + "đ";
    }

    private String pct(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) return "—";
        return oneDecimal(value * 100) + "%";
    }

    private String oneDecimal(double value) {
        return String.format(new Locale("vi", "VN"), "%.1f", value);
    }

    private String formatUpdated() {
        if (dashboard == null || dashboard.lastUpdated == null || dashboard.lastUpdated.isEmpty()) return "";
        try {
            Instant i = Instant.parse(dashboard.lastUpdated);
            java.time.ZonedDateTime z = i.atZone(VN_ZONE);
            return "Cập nhật: " + z.format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
        } catch (Exception e) {
            return "Cập nhật: " + dashboard.lastUpdated;
        }
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private static final class Stats {
        double createdRevenue;
        double grossRevenue;
        double discountRevenue;
        double codRevenue;
        double prepaidRevenue;
        double successfulRevenue;
        double pendingRevenue;
        double shippingRevenue;
        double returnRevenue;
        int orders;
        int successfulOrders;
        int returnOrders;
        double returnRate;
        double aov;
    }

    private static final class NamedStats {
        final String name;
        final Stats stats;
        NamedStats(String name, Stats stats) {
            this.name = name;
            this.stats = stats;
        }
    }
}
