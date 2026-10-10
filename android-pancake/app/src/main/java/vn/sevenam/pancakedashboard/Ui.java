package vn.sevenam.pancakedashboard;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;

/**
 * Material 3 design tokens (seed = Seven.AM red #A7192E) and small view factories.
 * Everything is built in code so the app keeps a single Activity and no extra libraries.
 */
final class Ui {
    // Surfaces & text
    static final int BG = 0xFFF7F2EF;
    static final int SURFACE = 0xFFFFFFFF;
    static final int SURFACE_LOW = 0xFFFBF7F5;
    static final int SURFACE_HIGH = 0xFFF1EAE6;
    static final int SURFACE_HIGHEST = 0xFFE9E1DC;
    static final int OUTLINE = 0xFFE3D9D3;
    static final int OUTLINE_STRONG = 0xFFC9BCB4;
    static final int ON_SURFACE = 0xFF201A18;
    static final int ON_VARIANT = 0xFF6D625C;
    static final int ON_FAINT = 0xFF978B84;
    // Brand
    static final int PRIMARY = 0xFFA7192E;
    static final int ON_PRIMARY = 0xFFFFFFFF;
    static final int PRIMARY_CONT = 0xFFFFDAD9;
    static final int ON_PRIMARY_CONT = 0xFF5C0014;
    static final int INVERSE = 0xFF2D2523;
    // Semantic
    static final int GOOD = 0xFF1B7347, GOOD_CONT = 0xFFDDF3E5;
    static final int WARN = 0xFF8A5800, WARN_CONT = 0xFFFFEDC6;
    static final int BAD = 0xFFB3261E, BAD_CONT = 0xFFFBE2E0;
    static final int INFO = 0xFF2C5D9C, INFO_CONT = 0xFFDFE9F8;
    static final int NEUTRAL = 0xFF6D625C, NEUTRAL_CONT = 0xFFEFE8E4;
    // Channels (same hues as the web legend)
    static final int CH_ADS = 0xFFA7192E, CH_LIVE = 0xFFC27A12, CH_ZALO = 0xFF2F6DB5;
    // Order status (statusColors on the web)
    static final int ST_TREO = 0xFFB57A21, ST_SHIP = 0xFF386BA7, ST_SUCCESS = 0xFF28734C,
            ST_RETURN = 0xFFA7192E, ST_CANCEL = 0xFF77716B;

    static final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT;
    static final int WRAP = ViewGroup.LayoutParams.WRAP_CONTENT;

    private static float density = 1f;
    private static final Locale VI = new Locale("vi", "VN");
    private static final NumberFormat INT_FMT = NumberFormat.getIntegerInstance(VI);
    private static final NumberFormat DEC1 = NumberFormat.getNumberInstance(VI);
    private static final NumberFormat DEC2 = NumberFormat.getNumberInstance(VI);

    static {
        DEC1.setMinimumFractionDigits(1);
        DEC1.setMaximumFractionDigits(1);
        DEC2.setMinimumFractionDigits(2);
        DEC2.setMaximumFractionDigits(2);
    }

    static void init(Context c) {
        density = c.getResources().getDisplayMetrics().density;
    }

    static int dp(float v) {
        return Math.round(v * density);
    }

    // ------------------------------------------------------------- formatting

    static String money(double v) {
        return INT_FMT.format(Math.round(v)) + "đ";
    }

    static String num(double v) {
        return INT_FMT.format(Math.round(v));
    }

    static String compact(double v) {
        if (v >= 1e9) return DEC2.format(v / 1e9) + " tỷ";
        if (v >= 1e6) return DEC1.format(v / 1e6) + "tr";
        return money(v);
    }

    /** Ratio -> "12,3%"; NaN / infinite -> "—". */
    static String pct(double ratio) {
        if (Double.isNaN(ratio) || Double.isInfinite(ratio)) return "—";
        return DEC1.format(ratio * 100) + "%";
    }

    static String dec1(double v) {
        return DEC1.format(v);
    }

    static String dec2(double v) {
        return DEC2.format(v);
    }

    // ---------------------------------------------------------------- shapes

    static GradientDrawable shape(int fill, int stroke, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.RECTANGLE);
        g.setColor(fill);
        if (stroke != 0) g.setStroke(Math.max(1, dp(1)), stroke);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    static GradientDrawable oval(int fill) {
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(fill);
        return g;
    }

    /** Touch feedback + click handler. */
    static void tap(View v, Runnable action) {
        v.setClickable(true);
        v.setFocusable(true);
        v.setForeground(new RippleDrawable(ColorStateList.valueOf(0x1F000000), null, shape(0xFF000000, 0, 18)));
        v.setOnClickListener(x -> action.run());
    }

    static int[] levelColors(String level) {
        switch (level == null ? "" : level) {
            case "good": return new int[]{GOOD, GOOD_CONT};
            case "warn": return new int[]{WARN, WARN_CONT};
            case "bad": return new int[]{BAD, BAD_CONT};
            case "info": return new int[]{INFO, INFO_CONT};
            default: return new int[]{NEUTRAL, NEUTRAL_CONT};
        }
    }

    // ---------------------------------------------------------- layout params

    static LinearLayout.LayoutParams block(int bottomDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(MATCH, WRAP);
        lp.bottomMargin = dp(bottomDp);
        return lp;
    }

    static LinearLayout.LayoutParams fixed(int heightDp, int bottomDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(MATCH, dp(heightDp));
        lp.bottomMargin = dp(bottomDp);
        return lp;
    }

    static LinearLayout.LayoutParams weight(float w) {
        return new LinearLayout.LayoutParams(0, WRAP, w);
    }

    // ----------------------------------------------------------------- views

    static LinearLayout column(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    static LinearLayout row(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    static TextView text(Context c, String s, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s == null ? "" : s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setTypeface(Typeface.create(bold ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        t.setLineSpacing(0, 1.12f);
        return t;
    }

    static TextView oneLine(TextView t) {
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        return t;
    }

    static TextView eyebrow(Context c, String s) {
        TextView t = text(c, s == null ? "" : s.toUpperCase(VI), 10.5f, PRIMARY, true);
        t.setLetterSpacing(.08f);
        return t;
    }

    /** M3 "outlined card": white surface, hairline outline, 20dp corners. */
    static LinearLayout card(Context c) {
        LinearLayout l = column(c);
        l.setBackground(shape(SURFACE, OUTLINE, 20));
        l.setPadding(dp(16), dp(16), dp(16), dp(16));
        return l;
    }

    /** M3 "filled card": tonal surface, no outline. */
    static LinearLayout tonal(Context c, int fill) {
        LinearLayout l = column(c);
        l.setBackground(shape(fill, 0, 16));
        l.setPadding(dp(12), dp(10), dp(12), dp(10));
        return l;
    }

    static View cardHead(Context c, String title, String sub, View trailing) {
        LinearLayout head = row(c);
        head.setGravity(Gravity.TOP);
        LinearLayout texts = column(c);
        texts.addView(text(c, title, 16, ON_SURFACE, true));
        if (sub != null && !sub.isEmpty()) {
            TextView s = text(c, sub, 12, ON_VARIANT, false);
            s.setPadding(0, dp(3), 0, 0);
            texts.addView(s);
        }
        head.addView(texts, weight(1));
        if (trailing != null) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(WRAP, WRAP);
            lp.leftMargin = dp(8);
            head.addView(trailing, lp);
        }
        head.setPadding(0, 0, 0, dp(12));
        return head;
    }

    static View sectionHead(Context c, String eyebrow, String title, String sub) {
        LinearLayout box = column(c);
        box.setPadding(dp(4), dp(6), dp(4), dp(12));
        box.addView(eyebrow(c, eyebrow));
        TextView t = text(c, title, 22, ON_SURFACE, true);
        t.setPadding(0, dp(3), 0, 0);
        box.addView(t);
        if (sub != null && !sub.isEmpty()) {
            TextView s = text(c, sub, 13, ON_VARIANT, false);
            s.setPadding(0, dp(4), 0, 0);
            box.addView(s);
        }
        return box;
    }

    static TextView pill(Context c, String s, int fg, int bg) {
        TextView t = text(c, s, 11.5f, fg, true);
        t.setPadding(dp(10), dp(5), dp(10), dp(5));
        t.setBackground(shape(bg, 0, 100));
        t.setGravity(Gravity.CENTER);
        return t;
    }

    static TextView levelPill(Context c, String level, String s) {
        int[] col = levelColors(level);
        return pill(c, s, col[0], col[1]);
    }

    static View dot(Context c, int color, int sizeDp) {
        View v = new View(c);
        v.setBackground(oval(color));
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp)));
        return v;
    }

    /** M3 filter chip. */
    static TextView chip(Context c, String s, boolean selected) {
        TextView t = text(c, (selected ? "✓ " : "") + s, 13, selected ? ON_PRIMARY_CONT : ON_SURFACE, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(14), 0, dp(14), 0);
        t.setBackground(selected ? shape(PRIMARY_CONT, 0, 10) : shape(SURFACE, OUTLINE_STRONG, 10));
        t.setMinHeight(dp(36));
        return t;
    }

    /** M3 buttons: filled (primary), tonal or outlined. */
    static TextView button(Context c, String s, String style) {
        int fg, bg, stroke = 0;
        if ("filled".equals(style)) {
            fg = ON_PRIMARY;
            bg = PRIMARY;
        } else if ("tonal".equals(style)) {
            fg = ON_PRIMARY_CONT;
            bg = PRIMARY_CONT;
        } else {
            fg = PRIMARY;
            bg = SURFACE;
            stroke = OUTLINE_STRONG;
        }
        TextView t = text(c, s, 14, fg, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(18), 0, dp(18), 0);
        t.setMinHeight(dp(44));
        t.setBackground(shape(bg, stroke, 100));
        return t;
    }

    static TextView iconButton(Context c, String glyph) {
        TextView t = text(c, glyph, 18, ON_SURFACE, true);
        t.setGravity(Gravity.CENTER);
        t.setBackground(shape(SURFACE, OUTLINE, 100));
        t.setLayoutParams(new LinearLayout.LayoutParams(dp(42), dp(42)));
        return t;
    }

    /** KPI tile: label (with optional status dot), big value, supporting line. */
    static LinearLayout tile(Context c, String label, String value, String sub, int dotColor, int valueColor) {
        LinearLayout t = tonal(c, SURFACE_LOW);
        t.setBackground(shape(SURFACE, OUTLINE, 16));
        t.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout head = row(c);
        if (dotColor != 0) {
            View d = dot(c, dotColor, 8);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(8), dp(8));
            lp.rightMargin = dp(6);
            head.addView(d, lp);
        }
        head.addView(oneLine(text(c, label, 12, ON_VARIANT, true)));
        t.addView(head);
        TextView v = oneLine(text(c, value, 19, valueColor == 0 ? ON_SURFACE : valueColor, true));
        v.setPadding(0, dp(6), 0, dp(2));
        t.addView(v);
        if (sub != null && !sub.isEmpty()) {
            TextView s = text(c, sub, 11, ON_FAINT, false);
            s.setMaxLines(2);
            s.setEllipsize(TextUtils.TruncateAt.END);
            t.addView(s);
        }
        return t;
    }

    /** Small stacked label / value used inside cards. */
    static LinearLayout stat(Context c, String label, String value, int valueColor) {
        LinearLayout box = column(c);
        box.addView(oneLine(text(c, label, 11, ON_VARIANT, false)));
        TextView v = oneLine(text(c, value, 14, valueColor == 0 ? ON_SURFACE : valueColor, true));
        v.setPadding(0, dp(3), 0, 0);
        box.addView(v);
        return box;
    }

    /** Lays out views in a grid with equal columns and 8dp gutters. */
    static LinearLayout grid(Context c, List<View> cells, int cols) {
        LinearLayout box = column(c);
        for (int i = 0; i < cells.size(); i += cols) {
            LinearLayout r = row(c);
            r.setGravity(Gravity.TOP);
            r.setBaselineAligned(false);
            for (int j = 0; j < cols; j++) {
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, MATCH, 1);
                if (j > 0) lp.leftMargin = dp(8);
                if (i + j < cells.size()) r.addView(cells.get(i + j), lp);
                else r.addView(new View(c), lp);
            }
            LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(MATCH, WRAP);
            if (i + cols < cells.size()) rl.bottomMargin = dp(8);
            box.addView(r, rl);
        }
        return box;
    }

    static View kv(Context c, String label, String value, int valueColor) {
        LinearLayout r = row(c);
        r.setPadding(0, dp(7), 0, dp(7));
        r.addView(text(c, label, 13, ON_VARIANT, false), weight(1));
        TextView v = text(c, value, 13, valueColor == 0 ? ON_SURFACE : valueColor, true);
        v.setGravity(Gravity.END);
        r.addView(v);
        return r;
    }

    static View divider(Context c) {
        View v = new View(c);
        v.setBackgroundColor(OUTLINE);
        v.setLayoutParams(new LinearLayout.LayoutParams(MATCH, Math.max(1, dp(1) / 2 + 1)));
        return v;
    }

    /** Thin progress bar (track + fill). */
    static View bar(Context c, double fraction, int color) {
        LinearLayout track = row(c);
        track.setBackground(shape(SURFACE_HIGH, 0, 100));
        float f = (float) Math.max(0, Math.min(1, Double.isNaN(fraction) ? 0 : fraction));
        View fill = new View(c);
        fill.setBackground(shape(color, 0, 100));
        track.addView(fill, new LinearLayout.LayoutParams(0, MATCH, f));
        track.addView(new View(c), new LinearLayout.LayoutParams(0, MATCH, 1 - f));
        track.setLayoutParams(new LinearLayout.LayoutParams(MATCH, dp(6)));
        return track;
    }

    static View legend(Context c, String[] names, int[] colors, boolean[] dashed) {
        LinearLayout r = row(c);
        r.setPadding(0, 0, 0, dp(8));
        for (int i = 0; i < names.length; i++) {
            View swatch = new View(c);
            boolean d = dashed != null && dashed[i];
            swatch.setBackground(d ? shape(0x00000000, colors[i], 2) : shape(colors[i], 0, 2));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(14), dp(d ? 4 : 8));
            lp.rightMargin = dp(5);
            if (i > 0) lp.leftMargin = dp(12);
            r.addView(swatch, lp);
            r.addView(text(c, names[i], 11.5f, ON_VARIANT, false));
        }
        return r;
    }

    /** Tonal callout for notes, warnings and empty states. */
    static View note(Context c, String s, String level) {
        int[] col = levelColors(level);
        TextView t = text(c, s, 12.5f, col[0], false);
        t.setBackground(shape(col[1], 0, 14));
        t.setPadding(dp(12), dp(10), dp(12), dp(10));
        return t;
    }

    static View empty(Context c, String s) {
        TextView t = text(c, s, 13, ON_VARIANT, false);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(12), dp(18), dp(12), dp(18));
        return t;
    }

    private Ui() {}
}
