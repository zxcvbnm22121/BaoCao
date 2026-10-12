package vn.sevenam.pancakedashboard;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.MotionEvent;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

/** Lightweight Canvas charts drawn at real pixel size (no stretched bitmaps). */
final class Charts {

    static final class Series {
        final String name;
        final int color;
        final double[] values;
        final boolean dashed;

        Series(String name, int color, double[] values, boolean dashed) {
            this.name = name;
            this.color = color;
            this.values = values;
            this.dashed = dashed;
        }
    }

    interface Fmt {
        String format(double v);
    }

    private static Paint textPaint(float sp, int color, boolean bold) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTextSize(Ui.dp(sp));
        p.setColor(color);
        p.setTypeface(Typeface.create(bold ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        return p;
    }

    static double niceCeil(double max) {
        if (max <= 0) return 1;
        double mag = Math.pow(10, Math.floor(Math.log10(max)));
        double norm = max / mag;
        double nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
        return nice * mag;
    }

    /**
     * Multi-series line chart with a touch crosshair: drag a finger across it to read every series
     * at that point (the web shows the same on hover).
     */
    static final class LineChart extends View {
        private final List<String> labels = new ArrayList<>();
        private final List<Series> series = new ArrayList<>();
        private final Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint axis = textPaint(10.5f, Ui.ON_FAINT, false);
        private final Paint label = textPaint(10.5f, Ui.ON_FAINT, false);
        private final Paint tipTitle = textPaint(11.5f, 0xFFFFFFFF, true);
        private final Paint tipText = textPaint(11f, 0xFFF3ECE8, false);
        private final Paint tipBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        private Fmt fmt = Ui::compact;
        private int touched = -1;

        LineChart(Context c) {
            super(c);
            grid.setColor(Ui.OUTLINE);
            grid.setStrokeWidth(Math.max(1, Ui.dp(1)));
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeWidth(Ui.dp(2.4f));
            line.setStrokeCap(Paint.Cap.ROUND);
            line.setStrokeJoin(Paint.Join.ROUND);
            axis.setTextAlign(Paint.Align.RIGHT);
            tipBg.setColor(Ui.INVERSE);
        }

        LineChart set(List<String> labels, List<Series> series, Fmt fmt) {
            this.labels.clear();
            this.labels.addAll(labels);
            this.series.clear();
            this.series.addAll(series);
            if (fmt != null) this.fmt = fmt;
            touched = -1;
            invalidate();
            return this;
        }

        private float padL() {
            return Ui.dp(48);
        }

        private float xAt(int i, float w) {
            float left = padL(), right = w - Ui.dp(10);
            if (labels.size() <= 1) return (left + right) / 2f;
            return left + (right - left) * i / (labels.size() - 1f);
        }

        @SuppressLint("ClickableViewAccessibility")
        @Override
        public boolean onTouchEvent(MotionEvent e) {
            if (labels.isEmpty()) return false;
            if (e.getAction() == MotionEvent.ACTION_DOWN || e.getAction() == MotionEvent.ACTION_MOVE) {
                getParent().requestDisallowInterceptTouchEvent(true);
                float w = getWidth();
                int best = 0;
                float bestD = Float.MAX_VALUE;
                for (int i = 0; i < labels.size(); i++) {
                    float d = Math.abs(xAt(i, w) - e.getX());
                    if (d < bestD) {
                        bestD = d;
                        best = i;
                    }
                }
                if (best != touched) {
                    touched = best;
                    invalidate();
                }
                return true;
            }
            if (e.getAction() == MotionEvent.ACTION_UP || e.getAction() == MotionEvent.ACTION_CANCEL) {
                getParent().requestDisallowInterceptTouchEvent(false);
                return true;
            }
            return super.onTouchEvent(e);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth(), h = getHeight();
            float padT = Ui.dp(10), padB = Ui.dp(24), left = padL(), right = w - Ui.dp(10);
            double max = 0;
            for (Series s : series) for (double v : s.values) if (!Double.isNaN(v)) max = Math.max(max, v);
            if (labels.isEmpty() || max <= 0) {
                Paint p = textPaint(13, Ui.ON_VARIANT, false);
                p.setTextAlign(Paint.Align.CENTER);
                canvas.drawText("Không có dữ liệu trong khoảng đang chọn", w / 2f, h / 2f, p);
                return;
            }
            double top = niceCeil(max);
            float plotH = h - padT - padB;
            for (int i = 0; i <= 4; i++) {
                float y = padT + plotH * i / 4f;
                canvas.drawLine(left, y, right, y, grid);
                canvas.drawText(axisLabel(top * (4 - i) / 4.0), left - Ui.dp(6), y + Ui.dp(4), axis);
            }
            // X labels: first, middle, last
            int n = labels.size();
            int[] picks = n >= 3 ? new int[]{0, n / 2, n - 1} : n == 2 ? new int[]{0, 1} : new int[]{0};
            for (int i : picks) {
                label.setTextAlign(i == 0 && n > 1 ? Paint.Align.LEFT : i == n - 1 && n > 1 ? Paint.Align.RIGHT : Paint.Align.CENTER);
                canvas.drawText(labels.get(i), xAt(i, w), h - Ui.dp(6), label);
            }
            for (Series s : series) {
                line.setColor(s.color);
                line.setPathEffect(s.dashed ? new DashPathEffect(new float[]{Ui.dp(6), Ui.dp(5)}, 0) : null);
                Path path = new Path();
                boolean started = false;
                for (int i = 0; i < n && i < s.values.length; i++) {
                    double v = s.values[i];
                    if (Double.isNaN(v)) continue;
                    float x = xAt(i, w);
                    float y = (float) (padT + plotH * (1 - v / top));
                    if (!started) {
                        path.moveTo(x, y);
                        started = true;
                    } else {
                        path.lineTo(x, y);
                    }
                }
                canvas.drawPath(path, line);
                if (!s.dashed && n == 1 && s.values.length > 0) {
                    fill.setColor(s.color);
                    canvas.drawCircle(xAt(0, w), (float) (padT + plotH * (1 - s.values[0] / top)), Ui.dp(4), fill);
                }
            }
            if (touched >= 0 && touched < n) drawTip(canvas, w, padT, plotH, top);
        }

        private void drawTip(Canvas canvas, float w, float padT, float plotH, double top) {
            float x = xAt(touched, w);
            Paint cross = new Paint(grid);
            cross.setColor(Ui.OUTLINE_STRONG);
            canvas.drawLine(x, padT, x, padT + plotH, cross);
            List<String> lines = new ArrayList<>();
            List<Integer> colors = new ArrayList<>();
            for (Series s : series) {
                if (touched >= s.values.length || Double.isNaN(s.values[touched])) continue;
                double v = s.values[touched];
                fill.setColor(s.color);
                canvas.drawCircle(x, (float) (padT + plotH * (1 - v / top)), Ui.dp(4), fill);
                lines.add(s.name + ": " + fmt.format(v));
                colors.add(s.color);
            }
            String title = labels.get(touched);
            float tw = tipTitle.measureText(title);
            for (String l : lines) tw = Math.max(tw, tipText.measureText(l) + Ui.dp(14));
            float boxW = tw + Ui.dp(20), boxH = Ui.dp(26) + lines.size() * Ui.dp(17);
            float bx = x + Ui.dp(10);
            if (bx + boxW > w) bx = x - Ui.dp(10) - boxW;
            if (bx < 0) bx = 0;
            float by = padT;
            canvas.drawRoundRect(new RectF(bx, by, bx + boxW, by + boxH), Ui.dp(10), Ui.dp(10), tipBg);
            canvas.drawText(title, bx + Ui.dp(10), by + Ui.dp(18), tipTitle);
            for (int i = 0; i < lines.size(); i++) {
                float ly = by + Ui.dp(36) + i * Ui.dp(17);
                fill.setColor(colors.get(i));
                canvas.drawCircle(bx + Ui.dp(14), ly - Ui.dp(4), Ui.dp(3.5f), fill);
                canvas.drawText(lines.get(i), bx + Ui.dp(22), ly, tipText);
            }
        }

        private String axisLabel(double v) {
            if (v >= 1e9) return Ui.dec1(v / 1e9) + " tỷ";
            if (v >= 1e6) return Math.round(v / 1e6) + "tr";
            if (v >= 1e3) return Math.round(v / 1e3) + "k";
            return String.valueOf(Math.round(v));
        }
    }

    /** One ranked row with 1–2 bars (e.g. Tạo đơn vs Thành công). */
    static final class HRow {
        final String label;
        final double[] values;
        final String valueText;

        HRow(String label, double[] values, String valueText) {
            this.label = label;
            this.values = values;
            this.valueText = valueText;
        }
    }

    /** Horizontal ranking bars: label + value on one line, bars underneath. Reads well on phones. */
    static final class HBars extends View {
        private final List<HRow> rows = new ArrayList<>();
        private int[] colors = {Ui.PRIMARY};
        private int[] barColors = {Ui.PRIMARY};
        private final Paint labelPaint = textPaint(12.5f, Ui.ON_SURFACE, true);
        private final Paint valuePaint = textPaint(12f, Ui.ON_VARIANT, false);
        private final Paint barPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        private double fixedMax = -1;

        HBars(Context c) {
            super(c);
            valuePaint.setTextAlign(Paint.Align.RIGHT);
            track.setColor(Ui.SURFACE_HIGH);
        }

        /** colors: one per series; a per-row override can be passed with rowColors. */
        HBars set(List<HRow> rows, int[] colors, int[] rowColors, double fixedMax) {
            this.rows.clear();
            this.rows.addAll(rows);
            this.colors = colors;
            this.barColors = rowColors;
            this.fixedMax = fixedMax;
            requestLayout();
            invalidate();
            return this;
        }

        private int seriesCount() {
            int n = 1;
            for (HRow r : rows) n = Math.max(n, r.values.length);
            return n;
        }

        private float rowHeight() {
            return Ui.dp(24) + seriesCount() * Ui.dp(11) + Ui.dp(8);
        }

        @Override
        protected void onMeasure(int widthSpec, int heightSpec) {
            int w = MeasureSpec.getSize(widthSpec);
            int h = rows.isEmpty() ? Ui.dp(64) : Math.round(rows.size() * rowHeight());
            setMeasuredDimension(w, h);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth();
            if (rows.isEmpty()) {
                Paint p = textPaint(13, Ui.ON_VARIANT, false);
                p.setTextAlign(Paint.Align.CENTER);
                canvas.drawText("Không có dữ liệu", w / 2f, getHeight() / 2f, p);
                return;
            }
            double max = fixedMax;
            if (max <= 0) for (HRow r : rows) for (double v : r.values) max = Math.max(max, v);
            if (max <= 0) max = 1;
            float rh = rowHeight();
            for (int i = 0; i < rows.size(); i++) {
                HRow r = rows.get(i);
                float y0 = i * rh;
                float valueW = valuePaint.measureText(r.valueText);
                String name = ellipsize(r.label, labelPaint, w - valueW - Ui.dp(12));
                canvas.drawText(name, 0, y0 + Ui.dp(15), labelPaint);
                canvas.drawText(r.valueText, w, y0 + Ui.dp(15), valuePaint);
                for (int j = 0; j < r.values.length; j++) {
                    float by = y0 + Ui.dp(23) + j * Ui.dp(11);
                    float bh = Ui.dp(7);
                    canvas.drawRoundRect(new RectF(0, by, w, by + bh), bh, bh, track);
                    float fw = (float) Math.max(0, Math.min(1, r.values[j] / max)) * w;
                    if (fw <= 0) continue;
                    int color = barColors != null && i < barColors.length && barColors[i] != 0
                            ? barColors[i] : colors[Math.min(j, colors.length - 1)];
                    barPaint.setColor(j == 0 ? color : (color & 0x00FFFFFF) | 0x66000000);
                    canvas.drawRoundRect(new RectF(0, by, Math.max(bh, fw), by + bh), bh, bh, barPaint);
                }
            }
        }

        private static String ellipsize(String s, Paint p, float maxW) {
            if (p.measureText(s) <= maxW) return s;
            String out = s;
            while (out.length() > 1 && p.measureText(out + "…") > maxW) out = out.substring(0, out.length() - 1);
            return out + "…";
        }
    }

    /** Vertical +/- bars around a zero line (daily gap vs target). */
    static final class GapBars extends View {
        private final List<String> labels = new ArrayList<>();
        private double[] values = new double[0];
        private final Paint good = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint bad = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint zero = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint label = textPaint(10.5f, Ui.ON_FAINT, false);
        private final Paint tip = textPaint(11.5f, Ui.ON_SURFACE, true);
        private int touched = -1;

        GapBars(Context c) {
            super(c);
            good.setColor(Ui.GOOD);
            bad.setColor(Ui.BAD);
            zero.setColor(Ui.OUTLINE_STRONG);
            zero.setStrokeWidth(Math.max(1, Ui.dp(1)));
            label.setTextAlign(Paint.Align.CENTER);
            tip.setTextAlign(Paint.Align.CENTER);
        }

        GapBars set(List<String> labels, double[] values) {
            this.labels.clear();
            this.labels.addAll(labels);
            this.values = values;
            touched = -1;
            invalidate();
            return this;
        }

        @SuppressLint("ClickableViewAccessibility")
        @Override
        public boolean onTouchEvent(MotionEvent e) {
            if (values.length == 0) return false;
            if (e.getAction() == MotionEvent.ACTION_DOWN || e.getAction() == MotionEvent.ACTION_MOVE) {
                getParent().requestDisallowInterceptTouchEvent(true);
                int i = (int) (e.getX() / (getWidth() / (float) values.length));
                i = Math.max(0, Math.min(values.length - 1, i));
                if (i != touched) {
                    touched = i;
                    invalidate();
                }
                return true;
            }
            if (e.getAction() == MotionEvent.ACTION_UP || e.getAction() == MotionEvent.ACTION_CANCEL) {
                getParent().requestDisallowInterceptTouchEvent(false);
                return true;
            }
            return super.onTouchEvent(e);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth(), h = getHeight();
            if (values.length == 0) return;
            double pos = 0, neg = 0;
            for (double v : values) {
                if (v > 0) pos = Math.max(pos, v);
                else neg = Math.max(neg, -v);
            }
            double span = pos + neg;
            if (span <= 0) span = 1;
            float top = Ui.dp(22), bottom = h - Ui.dp(20);
            float plot = bottom - top;
            float mid = top + (float) (pos / span) * plot;
            double max = span;
            float half = plot;
            float slot = w / values.length, bw = Math.max(Ui.dp(2), Math.min(Ui.dp(18), slot * .62f));
            canvas.drawLine(0, mid, w, mid, zero);
            int step = Math.max(1, (int) Math.ceil(values.length / 7.0));
            for (int i = 0; i < values.length; i++) {
                float cx = slot * i + slot / 2f;
                float bh = (float) (Math.abs(values[i]) / max * half);
                RectF r = values[i] >= 0 ? new RectF(cx - bw / 2, mid - bh, cx + bw / 2, mid)
                        : new RectF(cx - bw / 2, mid, cx + bw / 2, mid + bh);
                Paint p = values[i] >= 0 ? good : bad;
                p.setAlpha(touched < 0 || touched == i ? 255 : 110);
                canvas.drawRoundRect(r, Ui.dp(3), Ui.dp(3), p);
                if (i % step == 0 || i == values.length - 1) canvas.drawText(labels.get(i), cx, h - Ui.dp(4), label);
            }
            if (touched >= 0) {
                double v = values[touched];
                String s = labels.get(touched) + " · " + (v >= 0 ? "Vượt " : "Thiếu ") + Ui.compact(Math.abs(v));
                tip.setColor(v >= 0 ? Ui.GOOD : Ui.BAD);
                canvas.drawText(s, w / 2f, Ui.dp(13), tip);
            }
        }
    }

    /** Progress meter: fill = % of target reached, marker = share of time elapsed. */
    static final class Meter extends View {
        private double fill, marker;
        private int color = Ui.PRIMARY;
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint bar = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint mark = new Paint(Paint.ANTI_ALIAS_FLAG);

        Meter(Context c) {
            super(c);
            track.setColor(Ui.SURFACE_HIGH);
            mark.setColor(Ui.ON_SURFACE);
        }

        Meter set(double fill, double marker, int color) {
            this.fill = fill;
            this.marker = marker;
            this.color = color;
            invalidate();
            return this;
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth(), h = getHeight();
            float th = Ui.dp(10), ty = (h - th) / 2f;
            canvas.drawRoundRect(new RectF(0, ty, w, ty + th), th, th, track);
            float fw = (float) Math.max(0, Math.min(1, fill)) * w;
            bar.setColor(color);
            if (fw > 0) canvas.drawRoundRect(new RectF(0, ty, Math.max(th, fw), ty + th), th, th, bar);
            float mx = (float) Math.max(0, Math.min(1, marker)) * w;
            float mw = Ui.dp(3);
            canvas.drawRoundRect(new RectF(Math.max(0, mx - mw / 2), 0, Math.min(w, mx + mw / 2), h), mw, mw, mark);
        }
    }

    private Charts() {}
}
