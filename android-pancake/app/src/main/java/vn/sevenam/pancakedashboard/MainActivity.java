package vn.sevenam.pancakedashboard;

import android.app.Activity;
import android.app.DatePickerDialog;
import android.app.Dialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Seven.AM Revenue Command Center — native Android version of the web dashboard.
 * Same six views, same filters, same Pancake data path and the same formulas (see Metrics).
 */
public class MainActivity extends Activity {
    static final String[] TABS = {"overview", "channels", "pages", "products", "sales", "monthly"};
    static final String[] TAB_LABELS = {"Tổng quan", "Kênh", "Page", "Sản phẩm", "Sale", "Tháng"};
    static final String[] TAB_ICONS = {"▦", "◫", "▤", "◆", "◎", "◒"};
    static final String[] TAB_TITLES = {"Tổng quan doanh thu", "Hiệu quả theo kênh", "Doanh thu theo Page",
            "Sản phẩm bán chạy", "Sale Online", "Tiến độ tháng"};
    private static final long REFRESH_MS = 30_000;
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm dd/MM");
    private static final DateTimeFormatter ORDER_TIME = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService net = Executors.newFixedThreadPool(2);
    Store store;
    final Filters filters = new Filters();
    String tab = "overview";
    String preset = "today";

    // Pancake data (only Ads / Live / Zalo orders are kept, like applyPayload on the web)
    final List<Order> orders = new ArrayList<>();
    String source = "LOCKED";
    String transport = "";
    String metaFrom = "";
    String metaTo = "";
    String lastUpdated = "";
    final Map<String, double[]> dayRecon = new LinkedHashMap<>();
    String password;
    String rangeLoadingKey = "";
    String rangeError = "";
    private int rangeRequest = 0;

    // Products use their own period and channel, like the web
    String prodPeriod = "day";
    String prodFrom = "";
    String prodTo = "";
    String prodChannel = Metrics.ALL;
    final List<Order> prodOrders = new ArrayList<>();
    String prodLoadedKey = "";
    String prodLoadingKey = "";
    String prodError = "";
    private int prodRequest = 0;

    private Screens screens;
    private LinearLayout root;
    private LinearLayout content;
    private ScrollView scroll;
    private TextView titleView;
    private TextView subView;
    private TextView liveChip;
    private LinearLayout filterArea;
    private LinearLayout presetRow;
    private TextView filterSummary;
    private LinearLayout bottomNav;
    private final List<LinearLayout> navItems = new ArrayList<>();
    private String renderedTab = "";
    private boolean pendingRender = false;
    private int pendingScrollY = -1;
    private boolean resumed = false;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            onTick();
            main.postDelayed(this, REFRESH_MS);
        }
    };

    // ------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Ui.init(this);
        store = new Store(this);
        screens = new Screens(this);
        String today = Metrics.today();
        filters.from = today;
        filters.to = today;
        prodFrom = today;
        prodTo = today;
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        buildShell();
        styleSystemBars();
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        main.removeCallbacks(tick);
        main.postDelayed(tick, REFRESH_MS);
        if (password != null) {
            loadRange(false);
            if ("products".equals(tab) && prodTo.compareTo(Metrics.today()) >= 0) loadProducts(false);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        resumed = false;
        main.removeCallbacks(tick);
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        net.shutdownNow();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (!"overview".equals(tab)) {
            switchTab("overview");
            return;
        }
        super.onBackPressed();
    }

    private void onTick() {
        if (!resumed) return;
        String today = Metrics.today();
        // Roll the "today" / "yesterday" presets over midnight, like the web's 30s interval.
        if ("today".equals(preset) && !today.equals(filters.to)) setPreset("today");
        if ("yesterday".equals(preset) && !Metrics.shiftDay(today, -1).equals(filters.to)) setPreset("yesterday");
        if ("day".equals(prodPeriod) && !today.equals(prodTo)) setProdPeriod("day");
        if (password != null) {
            loadRange(false);
            if ("products".equals(tab) && prodTo.compareTo(today) >= 0) loadProducts(false);
        }
        updateHeader();
    }

    // ---------------------------------------------------------------- shell

    private void buildShell() {
        root = Ui.column(this);
        root.setBackgroundColor(Ui.BG);
        setContentView(root);

        // Top app bar
        LinearLayout top = Ui.row(this);
        top.setPadding(Ui.dp(18), Ui.dp(10), Ui.dp(14), Ui.dp(4));
        LinearLayout titles = Ui.column(this);
        titles.addView(Ui.eyebrow(this, "Seven.AM · Live sales"));
        titleView = Ui.oneLine(Ui.text(this, "", 20, Ui.ON_SURFACE, true));
        titleView.setPadding(0, Ui.dp(2), 0, 0);
        titles.addView(titleView);
        subView = Ui.oneLine(Ui.text(this, "", 12, Ui.ON_VARIANT, false));
        subView.setPadding(0, Ui.dp(2), 0, 0);
        titles.addView(subView);
        top.addView(titles, Ui.weight(1));

        liveChip = Ui.pill(this, "", Ui.PRIMARY, Ui.PRIMARY_CONT);
        liveChip.setMinHeight(Ui.dp(34));
        Ui.tap(liveChip, this::onLiveChip);
        top.addView(liveChip);

        TextView refresh = Ui.iconButton(this, "↻");
        Ui.tap(refresh, this::manualRefresh);
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(Ui.dp(42), Ui.dp(42));
        rlp.leftMargin = Ui.dp(8);
        top.addView(refresh, rlp);

        TextView settings = Ui.iconButton(this, "⚙");
        Ui.tap(settings, this::openSettings);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(Ui.dp(42), Ui.dp(42));
        slp.leftMargin = Ui.dp(6);
        top.addView(settings, slp);
        root.addView(top, Ui.block(0));

        // Filter area: date presets + filter summary + quick report
        filterArea = Ui.column(this);
        HorizontalScrollView presetScroll = new HorizontalScrollView(this);
        presetScroll.setHorizontalScrollBarEnabled(false);
        presetScroll.setClipToPadding(false);
        presetScroll.setPadding(Ui.dp(16), Ui.dp(8), Ui.dp(16), Ui.dp(8));
        presetRow = Ui.row(this);
        presetScroll.addView(presetRow);
        filterArea.addView(presetScroll, Ui.block(0));

        LinearLayout actions = Ui.row(this);
        actions.setPadding(Ui.dp(16), 0, Ui.dp(16), Ui.dp(10));
        LinearLayout summaryBox = Ui.row(this);
        summaryBox.setBackground(Ui.shape(Ui.SURFACE, Ui.OUTLINE, 14));
        summaryBox.setPadding(Ui.dp(12), 0, Ui.dp(12), 0);
        summaryBox.setMinimumHeight(Ui.dp(44));
        TextView filterIcon = Ui.text(this, "☰", 15, Ui.PRIMARY, true);
        filterIcon.setPadding(0, 0, Ui.dp(8), 0);
        summaryBox.addView(filterIcon);
        filterSummary = Ui.oneLine(Ui.text(this, "", 12.5f, Ui.ON_SURFACE, true));
        summaryBox.addView(filterSummary, Ui.weight(1));
        Ui.tap(summaryBox, this::openFilters);
        actions.addView(summaryBox, new LinearLayout.LayoutParams(0, Ui.dp(44), 1));
        TextView quick = Ui.button(this, "▣ Báo cáo nhanh", "tonal");
        quick.setTextSize(13);
        quick.setPadding(Ui.dp(14), 0, Ui.dp(14), 0);
        Ui.tap(quick, this::openQuickReport);
        LinearLayout.LayoutParams qlp = new LinearLayout.LayoutParams(Ui.WRAP, Ui.dp(44));
        qlp.leftMargin = Ui.dp(8);
        actions.addView(quick, qlp);
        filterArea.addView(actions, Ui.block(0));
        root.addView(filterArea, Ui.block(0));

        // Content
        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        content = Ui.column(this);
        content.setPadding(Ui.dp(14), Ui.dp(2), Ui.dp(14), Ui.dp(24));
        scroll.addView(content, new ScrollView.LayoutParams(Ui.MATCH, Ui.WRAP));
        root.addView(scroll, new LinearLayout.LayoutParams(Ui.MATCH, 0, 1));

        // M3 navigation bar
        bottomNav = Ui.row(this);
        bottomNav.setBackgroundColor(Ui.SURFACE);
        bottomNav.setPadding(Ui.dp(4), Ui.dp(8), Ui.dp(4), Ui.dp(8));
        bottomNav.setElevation(Ui.dp(6));
        for (int i = 0; i < TABS.length; i++) addNavItem(i);
        root.addView(bottomNav, Ui.block(0));

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left = 0, top2 = 0, right = 0, bottom = 0, ime = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                Insets imeInsets = insets.getInsets(WindowInsets.Type.ime());
                left = bars.left;
                top2 = bars.top;
                right = bars.right;
                bottom = bars.bottom;
                ime = imeInsets.bottom;
            } else {
                top2 = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            boolean keyboard = ime > bottom;
            v.setPadding(left, top2, right, keyboard ? ime : 0);
            bottomNav.setPadding(Ui.dp(4), Ui.dp(8), Ui.dp(4), Ui.dp(8) + (keyboard ? 0 : bottom));
            bottomNav.setVisibility(keyboard ? View.GONE : View.VISIBLE);
            return insets;
        });
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) getWindow().setDecorFitsSystemWindows(false);
        root.requestApplyInsets();
    }

    @SuppressWarnings("deprecation")
    private void styleSystemBars() {
        Window w = getWindow();
        w.setStatusBarColor(Ui.BG);
        w.setNavigationBarColor(Ui.SURFACE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(mask, mask);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                    | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    private void addNavItem(int index) {
        LinearLayout item = Ui.column(this);
        item.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView icon = Ui.text(this, TAB_ICONS[index], 16, Ui.ON_VARIANT, true);
        icon.setGravity(Gravity.CENTER);
        item.addView(icon, new LinearLayout.LayoutParams(Ui.dp(52), Ui.dp(30)));
        TextView label = Ui.oneLine(Ui.text(this, TAB_LABELS[index], 11, Ui.ON_VARIANT, true));
        label.setGravity(Gravity.CENTER);
        label.setPadding(0, Ui.dp(4), 0, 0);
        item.addView(label, new LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP));
        item.setTag(TABS[index]);
        item.setOnClickListener(v -> switchTab(TABS[index]));
        navItems.add(item);
        bottomNav.addView(item, new LinearLayout.LayoutParams(0, Ui.WRAP, 1));
    }

    private void updateNav() {
        for (LinearLayout item : navItems) {
            boolean active = tab.equals(item.getTag());
            TextView icon = (TextView) item.getChildAt(0);
            TextView label = (TextView) item.getChildAt(1);
            icon.setBackground(active ? Ui.shape(Ui.PRIMARY_CONT, 0, 100) : null);
            icon.setTextColor(active ? Ui.ON_PRIMARY_CONT : Ui.ON_VARIANT);
            label.setTextColor(active ? Ui.ON_SURFACE : Ui.ON_VARIANT);
        }
    }

    private void updatePresets() {
        presetRow.removeAllViews();
        String[][] items = {{"today", "Hôm nay"}, {"yesterday", "Hôm qua"}, {"7d", "7 ngày"},
                {"month", "Tháng này"}, {"custom", "Tuỳ chọn…"}};
        for (int i = 0; i < items.length; i++) {
            final String key = items[i][0];
            TextView chip = Ui.chip(this, items[i][1], key.equals(preset));
            Ui.tap(chip, () -> {
                if ("custom".equals(key)) openFilters();
                else setPreset(key);
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.WRAP, Ui.dp(36));
            if (i > 0) lp.leftMargin = Ui.dp(8);
            presetRow.addView(chip, lp);
        }
    }

    void updateHeader() {
        int idx = tabIndex(tab);
        titleView.setText(TAB_TITLES[idx]);
        if (!isUnlocked()) {
            subView.setText("Chưa mở dữ liệu Pancake LIVE");
        } else {
            String when = formatInstant(lastUpdated);
            subView.setText("Pancake POS · cập nhật " + (when.isEmpty() ? "—" : when));
        }
        if (!isUnlocked()) {
            setChip("🔒 Mở", Ui.ON_PRIMARY, Ui.PRIMARY);
        } else if (!rangeLoadingKey.isEmpty() || !prodLoadingKey.isEmpty()) {
            setChip("Đang tải…", Ui.INFO, Ui.INFO_CONT);
        } else if (!rangeError.isEmpty()) {
            setChip("Lỗi tải", Ui.BAD, Ui.BAD_CONT);
        } else {
            setChip("● LIVE", Ui.GOOD, Ui.GOOD_CONT);
        }
        filterSummary.setText(Metrics.shortDay(filters.from) + " → " + Metrics.shortDay(filters.to)
                + " · " + filters.label());
        filterArea.setVisibility("products".equals(tab) ? View.GONE : View.VISIBLE);
        updatePresets();
        updateNav();
    }

    private void setChip(String text, int fg, int bg) {
        liveChip.setText(text);
        liveChip.setTextColor(fg);
        liveChip.setBackground(Ui.shape(bg, 0, 100));
    }

    private void onLiveChip() {
        if (!isUnlocked()) openUnlock();
        else manualRefresh();
    }

    private void manualRefresh() {
        if (!isUnlocked()) {
            openUnlock();
            return;
        }
        loadRange(true);
        if ("products".equals(tab)) loadProducts(true);
        toast("Đang làm mới dữ liệu Pancake…");
    }

    static int tabIndex(String t) {
        for (int i = 0; i < TABS.length; i++) if (TABS[i].equals(t)) return i;
        return 0;
    }

    void switchTab(String t) {
        tab = t;
        render();
        if ("products".equals(t)) loadProducts(false);
    }

    /** Rebuilds the current view; keeps the scroll position when the tab did not change. */
    void render() {
        View focus = getCurrentFocus();
        if (focus instanceof EditText && focus.getRootView() == root.getRootView() && tab.equals(renderedTab)) {
            pendingRender = true; // don't kill an input the user is typing in
            updateHeader();
            return;
        }
        pendingRender = false;
        updateHeader();
        boolean sameTab = tab.equals(renderedTab);
        int y = !sameTab ? 0 : (pendingScrollY >= 0 ? pendingScrollY : scroll.getScrollY());
        pendingScrollY = y;
        content.removeAllViews();
        try {
            content.addView(screens.build(tab));
        } catch (Exception e) {
            content.addView(Ui.note(this, "Không hiển thị được màn này: " + e.getMessage(), "bad"), Ui.block(12));
        }
        renderedTab = tab;
        scroll.post(() -> {
            scroll.scrollTo(0, y);
            pendingScrollY = -1;
        });
    }

    void flushPendingRender() {
        if (pendingRender) {
            View focus = getCurrentFocus();
            if (focus != null) focus.clearFocus();
            render();
        }
    }

    // ----------------------------------------------------------------- data

    boolean isUnlocked() {
        return password != null && "PANCAKE".equals(source);
    }

    List<String> days() {
        return Metrics.days(filters.from, filters.to);
    }

    /** reportCoverageError() on the web; null when the selected range can be reported. */
    String coverageError() {
        if (!isUnlocked()) return null;
        if (days().isEmpty()) {
            return "Khoảng ngày không hợp lệ. Từ ngày phải trước hoặc bằng Đến ngày (tối đa 1 năm).";
        }
        boolean outside = (!metaFrom.isEmpty() && filters.from.compareTo(metaFrom) < 0)
                || (!metaTo.isEmpty() && filters.to.compareTo(metaTo) > 0);
        if (!outside) return null;
        String key = filters.from + "|" + filters.to;
        if (rangeLoadingKey.equals(key)) {
            return "Đang lấy dữ liệu Pancake POS cho " + Metrics.shortDay(filters.from) + " → " + Metrics.shortDay(filters.to) + "…";
        }
        if (!rangeError.isEmpty()) {
            return "Không tải được " + filters.from + " → " + filters.to + " từ Pancake: " + rangeError;
        }
        return "Dữ liệu đã đồng bộ chỉ từ " + metaFrom + " đến " + metaTo + ". Khoảng đang chọn nằm ngoài phạm vi nguồn.";
    }

    boolean coverageLoading() {
        return rangeLoadingKey.equals(filters.from + "|" + filters.to);
    }

    void setPreset(String p) {
        String today = Metrics.today();
        switch (p) {
            case "yesterday":
                filters.from = Metrics.shiftDay(today, -1);
                filters.to = filters.from;
                break;
            case "7d":
                filters.from = Metrics.shiftDay(today, -6);
                filters.to = today;
                break;
            case "month":
                filters.from = Metrics.monthStart(today);
                filters.to = today;
                break;
            default:
                filters.from = today;
                filters.to = today;
                p = "today";
        }
        preset = p;
        render();
        loadRange(false);
    }

    private void apply(DashboardData d) {
        orders.clear();
        for (Order o : d.orders) if (Metrics.isKpiChannel(o.channel)) orders.add(o);
        source = "PANCAKE".equals(d.source) ? "PANCAKE" : "DEMO";
        transport = d.transport == null ? "" : d.transport;
        metaFrom = d.from == null ? "" : d.from;
        metaTo = d.to == null ? "" : d.to;
        lastUpdated = d.lastUpdated == null ? "" : d.lastUpdated;
        dayRecon.clear();
        if (!d.dayReconciliation.isEmpty()) {
            dayRecon.putAll(orders.size() == d.orders.size() ? d.dayReconciliation : Metrics.dayReconciliationOf(orders));
        }
        store.payloadMonthly = d.monthlyTarget;
        // Keep a filter value only if it still exists in the data (populateFilters on the web).
        if (!Metrics.ALL.equals(filters.channel) && !Metrics.distinctSorted(orders, o -> o.channel).contains(filters.channel)) {
            filters.channel = Metrics.ALL;
        }
        if (!Metrics.ALL.equals(filters.staff) && !Metrics.distinctSorted(orders, o -> o.salesStaff).contains(filters.staff)) {
            filters.staff = Metrics.ALL;
        }
        render();
    }

    /** Reads the selected From/To range straight from Pancake POS (loadMainRange on the web). */
    void loadRange(boolean force) {
        if (password == null) return;
        final String from = filters.from, to = filters.to;
        if (Metrics.days(from, to).isEmpty()) {
            render();
            return;
        }
        final String key = from + "|" + to;
        if (!force && key.equals(rangeLoadingKey)) return;
        final int req = ++rangeRequest;
        rangeLoadingKey = key;
        if (coverageError() != null) render();
        else updateHeader();
        final String pwd = password;
        net.execute(() -> {
            try {
                DashboardData d = PancakeApi.range(pwd, from, to);
                Metrics.verify(d);
                main.post(() -> {
                    if (req != rangeRequest) return;
                    rangeLoadingKey = "";
                    rangeError = "";
                    apply(d);
                });
            } catch (Exception e) {
                main.post(() -> {
                    if (req != rangeRequest) return;
                    rangeLoadingKey = "";
                    rangeError = message(e, "Không tải được dữ liệu Pancake");
                    if (force) toast(rangeError);
                    if (coverageError() != null) render();
                    else updateHeader();
                });
            }
        });
    }

    String[] prodRange() {
        String a = prodFrom.isEmpty() ? Metrics.today() : prodFrom;
        String b = prodTo.isEmpty() ? a : prodTo;
        return a.compareTo(b) <= 0 ? new String[]{a, b} : new String[]{b, a};
    }

    boolean prodInsideMain() {
        String[] r = prodRange();
        return isUnlocked() && !metaFrom.isEmpty() && !metaTo.isEmpty()
                && r[0].compareTo(metaFrom) >= 0 && r[1].compareTo(metaTo) <= 0;
    }

    List<Order> productBase() {
        String[] r = prodRange();
        return (r[0] + "|" + r[1]).equals(prodLoadedKey) ? prodOrders : orders;
    }

    void setProdPeriod(String p) {
        String today = Metrics.today();
        switch (p) {
            case "yesterday":
                prodFrom = Metrics.shiftDay(today, -1);
                prodTo = prodFrom;
                break;
            case "week":
                prodFrom = Metrics.shiftDay(today, -6);
                prodTo = today;
                break;
            case "month":
                prodFrom = Metrics.monthStart(today);
                prodTo = today;
                break;
            default:
                prodFrom = today;
                prodTo = today;
                p = "day";
        }
        prodPeriod = p;
        if ("products".equals(tab)) render();
        loadProducts(false);
    }

    void setProdCustom(String from, String to) {
        prodFrom = from;
        prodTo = to;
        prodPeriod = "custom";
        render();
        loadProducts(false);
    }

    /** loadProductRange() on the web: reuse the main data when it covers the range, else read Pancake. */
    void loadProducts(boolean force) {
        final String[] r = prodRange();
        final String key = r[0] + "|" + r[1];
        if (!force && prodInsideMain()) {
            prodLoadedKey = "";
            prodOrders.clear();
            prodError = "";
            if ("products".equals(tab)) render();
            return;
        }
        if (password == null) {
            prodError = "Cần mở dữ liệu LIVE để tải khoảng thời gian này.";
            if ("products".equals(tab)) render();
            return;
        }
        if (!force && key.equals(prodLoadedKey)) return;
        if (key.equals(prodLoadingKey)) return;
        final int req = ++prodRequest;
        prodLoadingKey = key;
        prodError = "";
        if ("products".equals(tab)) render();
        final String pwd = password;
        net.execute(() -> {
            try {
                DashboardData d = PancakeApi.range(pwd, r[0], r[1]);
                main.post(() -> {
                    if (req != prodRequest) return;
                    prodLoadingKey = "";
                    prodOrders.clear();
                    for (Order o : d.orders) {
                        String day = Metrics.orderDate(o);
                        if (day.compareTo(r[0]) >= 0 && day.compareTo(r[1]) <= 0 && Metrics.isKpiChannel(o.channel)) {
                            prodOrders.add(o);
                        }
                    }
                    prodLoadedKey = key;
                    if ("products".equals(tab)) render();
                    else updateHeader();
                });
            } catch (Exception e) {
                main.post(() -> {
                    if (req != prodRequest) return;
                    prodLoadingKey = "";
                    prodError = message(e, "Không tải được dữ liệu sản phẩm cho khoảng đã chọn.");
                    if ("products".equals(tab)) render();
                    else updateHeader();
                });
            }
        });
    }

    double channelData(String channel) {
        return store.channelData(filters.from, filters.to, channel);
    }

    void setChannelData(String channel, double value) {
        if (Math.abs(value - channelData(channel)) < .5) return;
        store.setChannelData(filters.from, filters.to, channel, value);
        View focus = getCurrentFocus();
        if (focus != null) focus.clearFocus();
        render();
    }

    // -------------------------------------------------------------- dialogs

    /** M3 modal bottom sheet: rounded surface, header, scrollable body, action row. */
    private Dialog sheet(String eyebrow, String title, View body, View actions) {
        Dialog d = new Dialog(this);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout box = Ui.column(this);
        box.setBackground(Ui.shape(Ui.SURFACE, 0, 28));
        box.setPadding(Ui.dp(20), Ui.dp(10), Ui.dp(20), Ui.dp(16));

        View handle = new View(this);
        handle.setBackground(Ui.shape(Ui.OUTLINE_STRONG, 0, 100));
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(Ui.dp(36), Ui.dp(4));
        hlp.gravity = Gravity.CENTER_HORIZONTAL;
        hlp.bottomMargin = Ui.dp(12);
        box.addView(handle, hlp);

        LinearLayout head = Ui.row(this);
        LinearLayout titles = Ui.column(this);
        titles.addView(Ui.eyebrow(this, eyebrow));
        TextView t = Ui.text(this, title, 20, Ui.ON_SURFACE, true);
        t.setPadding(0, Ui.dp(3), 0, 0);
        titles.addView(t);
        head.addView(titles, Ui.weight(1));
        TextView close = Ui.iconButton(this, "×");
        Ui.tap(close, d::dismiss);
        head.addView(close, new LinearLayout.LayoutParams(Ui.dp(40), Ui.dp(40)));
        box.addView(head, Ui.block(12));

        ScrollView sv = new ScrollView(this);
        sv.addView(body);
        box.addView(sv, new LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP, 1));
        if (actions != null) {
            LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP);
            alp.topMargin = Ui.dp(14);
            box.addView(actions, alp);
        }

        FrameLayout frame = new FrameLayout(this);
        frame.setPadding(Ui.dp(8), Ui.dp(8), Ui.dp(8), Ui.dp(8));
        frame.addView(box, new FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP));
        d.setContentView(frame);
        Window w = d.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            w.setLayout(Ui.MATCH, Ui.WRAP);
            w.setGravity(Gravity.BOTTOM);
            w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                    | WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN);
        }
        return d;
    }

    private LinearLayout actionRow(TextView... buttons) {
        LinearLayout r = Ui.row(this);
        r.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        for (int i = 0; i < buttons.length; i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, Ui.dp(46), 1);
            if (i > 0) lp.leftMargin = Ui.dp(8);
            r.addView(buttons[i], lp);
        }
        return r;
    }

    EditText field(String hint, String value, boolean password) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setText(value);
        e.setTextSize(16);
        e.setTextColor(Ui.ON_SURFACE);
        e.setHintTextColor(Ui.ON_FAINT);
        e.setSingleLine(true);
        e.setPadding(Ui.dp(14), Ui.dp(10), Ui.dp(14), Ui.dp(10));
        e.setBackground(Ui.shape(Ui.SURFACE, Ui.OUTLINE_STRONG, 12));
        e.setInputType(password ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
                : InputType.TYPE_CLASS_NUMBER);
        return e;
    }

    private View labeled(String label, View child) {
        LinearLayout box = Ui.column(this);
        TextView l = Ui.text(this, label, 12.5f, Ui.ON_VARIANT, true);
        l.setPadding(Ui.dp(2), 0, 0, Ui.dp(6));
        box.addView(l);
        box.addView(child, new LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(50)));
        box.setPadding(0, 0, 0, Ui.dp(12));
        return box;
    }

    static double parseNumber(String s) {
        if (s == null) return 0;
        String digits = s.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return 0;
        try {
            return Double.parseDouble(digits);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    void openUnlock() {
        LinearLayout body = Ui.column(this);
        TextView note = Ui.text(this, "Nhập mật khẩu dashboard để mở dữ liệu Pancake. Mật khẩu được backend xác thực; "
                + "API key Pancake không nằm trên điện thoại.", 13, Ui.ON_VARIANT, false);
        note.setPadding(0, 0, 0, Ui.dp(14));
        body.addView(note);
        EditText pwd = field("Mật khẩu dashboard", "", true);
        body.addView(labeled("Mật khẩu dashboard", pwd));
        TextView error = Ui.text(this, "", 12.5f, Ui.BAD, false);
        body.addView(error);

        TextView cancel = Ui.button(this, "Đóng", "outlined");
        TextView submit = Ui.button(this, "Mở dữ liệu", "filled");
        Dialog d = sheet("Dữ liệu Pancake", "Mở dashboard LIVE", body, actionRow(cancel, submit));
        Ui.tap(cancel, d::dismiss);
        Runnable go = () -> {
            String p = pwd.getText().toString();
            if (p.isEmpty()) {
                error.setText("Nhập mật khẩu dashboard.");
                return;
            }
            error.setTextColor(Ui.INFO);
            error.setText("Đang xác thực và tải dữ liệu…");
            submit.setEnabled(false);
            submit.setAlpha(.6f);
            net.execute(() -> {
                try {
                    DashboardData data = PancakeApi.openLive(p);
                    Metrics.verify(data);
                    main.post(() -> {
                        password = p;
                        apply(data);
                        d.dismiss();
                        toast("Đã mở dữ liệu Pancake LIVE");
                        loadRange(false);
                        if ("products".equals(tab)) loadProducts(false);
                    });
                } catch (Exception e) {
                    main.post(() -> {
                        error.setTextColor(Ui.BAD);
                        error.setText(message(e, "Không mở được dữ liệu. Kiểm tra mật khẩu hoặc kết nối mạng."));
                        submit.setEnabled(true);
                        submit.setAlpha(1f);
                    });
                }
            });
        };
        Ui.tap(submit, go);
        pwd.setImeOptions(EditorInfo.IME_ACTION_DONE);
        pwd.setOnEditorActionListener((v, actionId, ev) -> {
            go.run();
            return true;
        });
        d.show();
        pwd.requestFocus();
        Window w = d.getWindow();
        if (w != null) w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
    }

    private TextView dateField(String value) {
        TextView t = Ui.text(this, value, 15, Ui.ON_SURFACE, true);
        t.setGravity(Gravity.CENTER_VERTICAL);
        t.setPadding(Ui.dp(14), 0, Ui.dp(14), 0);
        t.setBackground(Ui.shape(Ui.SURFACE, Ui.OUTLINE_STRONG, 12));
        return t;
    }

    interface DateCallback {
        void onDate(String iso);
    }

    void pickDate(String current, DateCallback cb) {
        LocalDate d;
        try {
            d = LocalDate.parse(current);
        } catch (Exception e) {
            d = LocalDate.now(Metrics.VN);
        }
        new DatePickerDialog(this, (view, y, m, day) -> cb.onDate(LocalDate.of(y, m + 1, day).toString()),
                d.getYear(), d.getMonthValue() - 1, d.getDayOfMonth()).show();
    }

    private HorizontalScrollView chipRow(List<String> values, List<String> labels, String selected, DateCallback onPick) {
        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        LinearLayout r = Ui.row(this);
        hs.addView(r);
        List<TextView> chips = new ArrayList<>();
        final String[] current = {selected};
        for (int i = 0; i < values.size(); i++) {
            final String v = values.get(i);
            TextView chip = Ui.chip(this, labels.get(i), v.equals(selected));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.WRAP, Ui.dp(36));
            if (i > 0) lp.leftMargin = Ui.dp(8);
            r.addView(chip, lp);
            chips.add(chip);
        }
        for (int i = 0; i < chips.size(); i++) {
            final int idx = i;
            Ui.tap(chips.get(i), () -> {
                current[0] = values.get(idx);
                for (int j = 0; j < chips.size(); j++) {
                    boolean on = j == idx;
                    TextView c = chips.get(j);
                    c.setText((on ? "✓ " : "") + labels.get(j));
                    c.setTextColor(on ? Ui.ON_PRIMARY_CONT : Ui.ON_SURFACE);
                    c.setBackground(on ? Ui.shape(Ui.PRIMARY_CONT, 0, 10) : Ui.shape(Ui.SURFACE, Ui.OUTLINE_STRONG, 10));
                }
                onPick.onDate(current[0]);
            });
        }
        return hs;
    }

    private View section(String label, View child) {
        LinearLayout box = Ui.column(this);
        TextView l = Ui.text(this, label, 12.5f, Ui.ON_VARIANT, true);
        l.setPadding(Ui.dp(2), 0, 0, Ui.dp(8));
        box.addView(l);
        box.addView(child);
        box.setPadding(0, 0, 0, Ui.dp(16));
        return box;
    }

    void openFilters() {
        final String[] from = {filters.from};
        final String[] to = {filters.to};
        final String[] channel = {filters.channel};
        final String[] staff = {filters.staff};
        final String[] status = {filters.status};

        LinearLayout body = Ui.column(this);
        LinearLayout dates = Ui.row(this);
        TextView fromView = dateField(Metrics.shortDay(from[0]) + "/" + from[0].substring(0, 4));
        TextView toView = dateField(Metrics.shortDay(to[0]) + "/" + to[0].substring(0, 4));
        Ui.tap(fromView, () -> pickDate(from[0], iso -> {
            from[0] = iso;
            fromView.setText(Metrics.shortDay(iso) + "/" + iso.substring(0, 4));
        }));
        Ui.tap(toView, () -> pickDate(to[0], iso -> {
            to[0] = iso;
            toView.setText(Metrics.shortDay(iso) + "/" + iso.substring(0, 4));
        }));
        LinearLayout fromBox = Ui.column(this);
        fromBox.addView(Ui.text(this, "Từ ngày", 12, Ui.ON_VARIANT, true));
        LinearLayout.LayoutParams flp = new LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(48));
        flp.topMargin = Ui.dp(6);
        fromBox.addView(fromView, flp);
        LinearLayout toBox = Ui.column(this);
        toBox.addView(Ui.text(this, "Đến ngày", 12, Ui.ON_VARIANT, true));
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(48));
        tlp.topMargin = Ui.dp(6);
        toBox.addView(toView, tlp);
        dates.addView(fromBox, Ui.weight(1));
        LinearLayout.LayoutParams tolp = Ui.weight(1);
        tolp.leftMargin = Ui.dp(10);
        dates.addView(toBox, tolp);
        dates.setPadding(0, 0, 0, Ui.dp(16));
        body.addView(dates);

        List<String> chVals = new ArrayList<>();
        List<String> chLabels = new ArrayList<>();
        chVals.add(Metrics.ALL);
        chLabels.add("Tất cả");
        for (String c : Metrics.distinctSorted(orders, o -> o.channel)) {
            chVals.add(c);
            chLabels.add(Metrics.channelLabel(c));
        }
        if (!chVals.contains(channel[0])) chVals.add(channel[0]);
        while (chLabels.size() < chVals.size()) chLabels.add(chVals.get(chLabels.size()));
        body.addView(section("Kênh", chipRow(chVals, chLabels, channel[0], v -> channel[0] = v)));

        List<String> stVals = new ArrayList<>();
        List<String> stLabels = new ArrayList<>();
        stVals.add(Metrics.ALL);
        stLabels.add("Tất cả");
        for (String s : Metrics.STATUS_KEYS) {
            stVals.add(s);
            stLabels.add(Metrics.statusLabel(s));
        }
        body.addView(section("Trạng thái", chipRow(stVals, stLabels, status[0], v -> status[0] = v)));

        List<String> staffVals = new ArrayList<>();
        staffVals.add(Metrics.ALL);
        staffVals.addAll(Metrics.distinctSorted(orders, o -> o.salesStaff));
        if (!staffVals.contains(staff[0])) staffVals.add(staff[0]);
        body.addView(section("Sale", chipRow(staffVals, staffVals, staff[0], v -> staff[0] = v)));
        body.addView(Ui.note(this, "“Tất cả” ẩn đơn Huỷ/Xoá, Đơn đổi và nguồn CSKH. Chọn một trạng thái cụ thể "
                + "để xem đúng trạng thái đó (vẫn loại Đơn đổi và CSKH).", "info"));

        TextView reset = Ui.button(this, "Đặt lại", "outlined");
        TextView applyBtn = Ui.button(this, "Áp dụng", "filled");
        Dialog d = sheet("Bộ lọc báo cáo", "Khoảng ngày, kênh, Sale", body, actionRow(reset, applyBtn));
        Ui.tap(reset, () -> {
            filters.channel = Metrics.ALL;
            filters.staff = Metrics.ALL;
            filters.status = Metrics.ALL;
            d.dismiss();
            setPreset("today");
        });
        Ui.tap(applyBtn, () -> {
            if (from[0].compareTo(to[0]) > 0) {
                String t = from[0];
                from[0] = to[0];
                to[0] = t;
            }
            boolean rangeChanged = !from[0].equals(filters.from) || !to[0].equals(filters.to);
            filters.from = from[0];
            filters.to = to[0];
            filters.channel = channel[0];
            filters.staff = staff[0];
            filters.status = status[0];
            if (rangeChanged) preset = detectPreset();
            d.dismiss();
            render();
            if (rangeChanged) loadRange(false);
        });
        d.show();
    }

    private String detectPreset() {
        String today = Metrics.today();
        if (filters.from.equals(today) && filters.to.equals(today)) return "today";
        String y = Metrics.shiftDay(today, -1);
        if (filters.from.equals(y) && filters.to.equals(y)) return "yesterday";
        if (filters.from.equals(Metrics.shiftDay(today, -6)) && filters.to.equals(today)) return "7d";
        if (filters.from.equals(Metrics.monthStart(today)) && filters.to.equals(today)) return "month";
        return "custom";
    }

    void openSettings() {
        LinearLayout body = Ui.column(this);
        TextView note = Ui.text(this, "Chỉ cần nhập target tháng của từng kênh. App tự cộng target tổng, chia target theo ngày "
                + "và tự tính GAP theo tiến độ — giống website.", 13, Ui.ON_VARIANT, false);
        note.setPadding(0, 0, 0, Ui.dp(14));
        body.addView(note);
        EditText ads = field("0", wholeOrEmpty(store.target("ads")), false);
        EditText live = field("0", wholeOrEmpty(store.target("live")), false);
        EditText zalo = field("0", wholeOrEmpty(store.target("zalo")), false);
        body.addView(labeled("Facebook Ads (đ/tháng)", ads));
        body.addView(labeled("Livestream (đ/tháng)", live));
        body.addView(labeled("Zalo (đ/tháng)", zalo));
        LinearLayout total = Ui.tonal(this, Ui.SURFACE_HIGH);
        TextView totalText = Ui.text(this, "", 15, Ui.ON_SURFACE, true);
        total.addView(Ui.text(this, "Target tổng tháng = Ads + Live + Zalo", 12, Ui.ON_VARIANT, false));
        totalText.setPadding(0, Ui.dp(4), 0, 0);
        total.addView(totalText);
        body.addView(total, Ui.block(10));
        body.addView(Ui.note(this, "GAP = Target phải đạt theo tiến độ − Doanh thu thực đạt. Mục tiêu lưu trên máy này.", "info"));
        Runnable refreshTotal = () -> totalText.setText(Ui.money(parseNumber(ads.getText().toString())
                + parseNumber(live.getText().toString()) + parseNumber(zalo.getText().toString())));
        TextWatcher watcher = simpleWatcher(refreshTotal);
        ads.addTextChangedListener(watcher);
        live.addTextChangedListener(watcher);
        zalo.addTextChangedListener(watcher);
        refreshTotal.run();

        TextView cancel = Ui.button(this, "Đóng", "outlined");
        TextView save = Ui.button(this, "Lưu & áp dụng", "filled");
        Dialog d = sheet("Cấu hình KPI", "Target tháng theo kênh", body, actionRow(cancel, save));
        Ui.tap(cancel, d::dismiss);
        Ui.tap(save, () -> {
            store.saveTargets(parseNumber(ads.getText().toString()), parseNumber(live.getText().toString()),
                    parseNumber(zalo.getText().toString()));
            d.dismiss();
            toast("Đã lưu target theo kênh");
            render();
        });
        d.show();
    }

    private static String wholeOrEmpty(double v) {
        return v > 0 ? String.valueOf(Math.round(v)) : "";
    }

    static TextWatcher simpleWatcher(Runnable action) {
        return new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                action.run();
            }

            @Override
            public void afterTextChanged(Editable s) {}
        };
    }

    // -------------------------------------------------------- quick report

    static final class QuickStats {
        double totalData, adsData, adsRevenue, liveRevenue;
        double adsCr = Double.NaN;
    }

    QuickStats quickStats() {
        QuickStats s = new QuickStats();
        List<Order> rows = Metrics.inRangeDefault(orders, filters.from, filters.to);
        int adsOrders = 0;
        for (Order o : rows) {
            if (Metrics.CH_ADS.equals(o.channel)) {
                adsOrders++;
                s.adsRevenue += Metrics.revenue(o);
            } else if (Metrics.CH_LIVE.equals(o.channel)) {
                s.liveRevenue += Metrics.revenue(o);
            }
        }
        s.adsData = store.channelData(filters.from, filters.to, Metrics.CH_ADS);
        s.totalData = store.quickTotal(filters.from, filters.to);
        s.adsCr = s.adsData > 0 ? adsOrders / s.adsData : Double.NaN;
        return s;
    }

    static String quickText(QuickStats s) {
        return "Data mới toàn kênh: " + (s.totalData > 0 ? Ui.num(s.totalData) : "Chưa nhập") + "\n"
                + "Data Ads: " + (s.adsData > 0 ? Ui.num(s.adsData) : "Chưa nhập") + "\n"
                + "CR Ads: " + Ui.pct(s.adsCr) + "\n"
                + "Doanh số Ads: " + Ui.money(s.adsRevenue) + "\n"
                + "Doanh số live: " + Ui.money(s.liveRevenue);
    }

    void openQuickReport() {
        if (!isUnlocked()) {
            openUnlock();
            return;
        }
        String cov = coverageError();
        if (cov != null) {
            toast(cov);
            return;
        }
        QuickStats init = quickStats();
        LinearLayout body = Ui.column(this);
        body.addView(Ui.pill(this, Metrics.shortDay(filters.from) + " → " + Metrics.shortDay(filters.to), Ui.ON_VARIANT, Ui.SURFACE_HIGH),
                new LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP));
        View spacer = new View(this);
        body.addView(spacer, new LinearLayout.LayoutParams(1, Ui.dp(12)));
        EditText total = field("Tự nhập", wholeOrEmpty(init.totalData), false);
        EditText ads = field("Nhập Data Ads", wholeOrEmpty(init.adsData), false);
        body.addView(labeled("Data mới toàn kênh", total));
        body.addView(labeled("Data Ads", ads));

        LinearLayout calc = Ui.tonal(this, Ui.SURFACE_LOW);
        calc.setBackground(Ui.shape(Ui.SURFACE_LOW, Ui.OUTLINE, 16));
        body.addView(calc, Ui.block(12));
        TextView preview = Ui.text(this, "", 14, Ui.ON_SURFACE, false);
        preview.setTextIsSelectable(true);
        preview.setTypeface(android.graphics.Typeface.MONOSPACE);
        LinearLayout previewBox = Ui.tonal(this, Ui.SURFACE_HIGH);
        previewBox.addView(Ui.text(this, "NỘI DUNG GỬI NHÓM", 10.5f, Ui.PRIMARY, true));
        preview.setPadding(0, Ui.dp(6), 0, 0);
        previewBox.addView(preview);
        body.addView(previewBox);

        Runnable refresh = () -> {
            store.setQuickTotal(filters.from, filters.to, parseNumber(total.getText().toString()));
            store.setChannelData(filters.from, filters.to, Metrics.CH_ADS, parseNumber(ads.getText().toString()));
            QuickStats s = quickStats();
            calc.removeAllViews();
            calc.addView(Ui.kv(this, "CR Ads", Ui.pct(s.adsCr), !Double.isNaN(s.adsCr) && s.adsCr < .1 ? Ui.BAD : 0));
            calc.addView(Ui.divider(this));
            calc.addView(Ui.kv(this, "Doanh số Ads", Ui.money(s.adsRevenue), 0));
            calc.addView(Ui.divider(this));
            calc.addView(Ui.kv(this, "Doanh số live", Ui.money(s.liveRevenue), 0));
            preview.setText(quickText(s));
        };
        refresh.run();
        TextWatcher w = simpleWatcher(refresh);
        total.addTextChangedListener(w);
        ads.addTextChangedListener(w);

        TextView share = Ui.button(this, "Chia sẻ ảnh", "outlined");
        TextView copy = Ui.button(this, "Sao chép", "filled");
        Dialog d = sheet("Báo cáo nhanh", "Báo cáo nhanh", body, actionRow(share, copy));
        Ui.tap(copy, () -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) {
                cm.setPrimaryClip(ClipData.newPlainText("Báo cáo nhanh Seven.AM", quickText(quickStats())));
                copy.setText("✓ Đã sao chép");
                main.postDelayed(() -> copy.setText("Sao chép"), 1400);
            } else {
                toast("Máy chưa cho phép sao chép tự động.");
            }
        });
        Ui.tap(share, () -> {
            try {
                ReportImageSharer.share(this, quickText(quickStats()), filters.from, filters.to);
            } catch (Exception e) {
                toast("Không tạo được ảnh báo cáo: " + e.getMessage());
            }
        });
        d.setOnDismissListener(x -> render());
        d.show();
    }

    // ---------------------------------------------------------- order drill

    void openDrill(String type, String value, String title) {
        if (!isUnlocked()) return;
        List<Order> rows = Metrics.drillRows(orders, filters, type, value);
        rows.sort((a, b) -> b.createdAt.compareTo(a.createdAt));
        Metrics.Overview k = Metrics.overview(rows);
        LinearLayout body = Ui.column(this);
        body.addView(Ui.text(this, filters.from + " → " + filters.to + " · " + filters.label(), 12, Ui.ON_VARIANT, false), Ui.block(10));
        List<View> summary = new ArrayList<>();
        summary.add(Ui.stat(this, "Số đơn", Ui.num(rows.size()), 0));
        summary.add(Ui.stat(this, "Tổng sau CK", Ui.compact(k.created), 0));
        summary.add(Ui.stat(this, "Thành công", Ui.compact(k.success), Ui.GOOD));
        LinearLayout sumBox = Ui.tonal(this, Ui.SURFACE_HIGH);
        sumBox.addView(Ui.grid(this, summary, 3));
        body.addView(sumBox, Ui.block(12));
        int shown = Math.min(300, rows.size());
        if (rows.size() > 300) body.addView(Ui.note(this, "Đang hiển thị 300/" + Ui.num(rows.size()) + " đơn mới nhất.", "info"), Ui.block(10));
        if (rows.isEmpty()) body.addView(Ui.empty(this, "Không có đơn phù hợp bộ lọc."));
        for (int i = 0; i < shown; i++) body.addView(orderRow(rows.get(i)), Ui.block(8));
        sheet("Chi tiết đơn hàng", title, body, null).show();
    }

    private View orderRow(Order o) {
        LinearLayout card = Ui.column(this);
        card.setBackground(Ui.shape(Ui.SURFACE_LOW, Ui.OUTLINE, 14));
        card.setPadding(Ui.dp(12), Ui.dp(10), Ui.dp(12), Ui.dp(10));
        LinearLayout top = Ui.row(this);
        top.addView(Ui.oneLine(Ui.text(this, o.orderCode.isEmpty() ? "—" : "#" + o.orderCode, 14, Ui.ON_SURFACE, true)), Ui.weight(1));
        top.addView(Ui.text(this, Ui.money(Metrics.revenue(o)), 14, Ui.ON_SURFACE, true));
        card.addView(top);
        TextView meta = Ui.text(this, formatOrderTime(o) + " · " + Metrics.staffOf(o) + " · " + Metrics.channelLabel(o.channel),
                12, Ui.ON_VARIANT, false);
        meta.setPadding(0, Ui.dp(4), 0, Ui.dp(6));
        card.addView(meta);
        LinearLayout tags = Ui.row(this);
        int col = Metrics.statusColor(o.status);
        tags.addView(Ui.pill(this, Metrics.statusLabel(o.status), col, (col & 0x00FFFFFF) | 0x22000000));
        TextView page = Ui.oneLine(Ui.text(this, Metrics.pageLabel(o), 12, Ui.ON_VARIANT, false));
        page.setPadding(Ui.dp(8), 0, 0, 0);
        tags.addView(page, Ui.weight(1));
        card.addView(tags);
        if ("HOAN".equals(o.status)) {
            TextView reason = Ui.text(this, "Lý do hoàn: " + Metrics.returnReason(o), 12, Ui.BAD, false);
            reason.setPadding(0, Ui.dp(6), 0, 0);
            card.addView(reason);
        }
        return card;
    }

    private static String formatOrderTime(Order o) {
        Instant t = Metrics.parseInstant(o.createdAt);
        return t == null ? Metrics.orderDate(o) : ORDER_TIME.format(t.atZone(Metrics.VN));
    }

    static String formatInstant(String iso) {
        Instant t = Metrics.parseInstant(iso);
        return t == null ? "" : TIME_FMT.format(t.atZone(Metrics.VN));
    }

    // -------------------------------------------------------------- helpers

    void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    private static String message(Exception e, String fallback) {
        String m = e.getMessage();
        if (m == null || m.trim().isEmpty()) return fallback;
        if (m.contains("Unable to resolve host") || m.contains("failed to connect") || m.contains("timeout")) {
            return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
        }
        return m;
    }
}
