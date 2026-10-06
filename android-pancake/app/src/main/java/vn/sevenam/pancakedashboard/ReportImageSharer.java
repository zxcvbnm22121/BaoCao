package vn.sevenam.pancakedashboard;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Locale;

final class ReportImageSharer {
    static void share(Activity activity, String report, String fromDate, String toDate) throws Exception {
        int width = 1080;
        int height = 1350;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.rgb(244, 241, 237));

        Paint card = new Paint(Paint.ANTI_ALIAS_FLAG);
        card.setColor(Color.WHITE);
        RectF cardRect = new RectF(70, 90, 1010, 1260);
        canvas.drawRoundRect(cardRect, 44, 44, card);

        Paint accent = new Paint(Paint.ANTI_ALIAS_FLAG);
        accent.setColor(Color.rgb(167, 25, 46));
        canvas.drawRoundRect(new RectF(70, 90, 1010, 112), 22, 22, accent);

        Paint title = paint(54, Color.rgb(24, 23, 22), true);
        canvas.drawText("SEVEN.AM", 125, 200, title);

        Paint sub = paint(28, Color.rgb(132, 124, 116), false);
        canvas.drawText("BÁO CÁO NHANH · PANCAKE", 125, 250, sub);
        canvas.drawText(fromDate + "  →  " + toDate, 125, 292, sub);

        Paint divider = new Paint(Paint.ANTI_ALIAS_FLAG);
        divider.setColor(Color.rgb(235, 229, 223));
        canvas.drawRoundRect(new RectF(125, 335, 955, 338), 2, 2, divider);

        String[] lines = report.split("\n");
        Paint label = paint(31, Color.rgb(115, 107, 100), false);
        Paint value = paint(44, Color.rgb(24, 23, 22), true);

        float y = 420;
        for (String line : lines) {
            int split = line.indexOf(':');
            String left = split >= 0 ? line.substring(0, split + 1) : line;
            String right = split >= 0 ? line.substring(split + 1).trim() : "";

            canvas.drawText(left, 125, y, label);
            canvas.drawText(right, 125, y + 62, value);

            Paint row = new Paint(Paint.ANTI_ALIAS_FLAG);
            row.setColor(Color.rgb(242, 238, 234));
            canvas.drawRoundRect(new RectF(125, y + 95, 955, y + 98), 2, 2, row);
            y += 165;
        }

        Paint foot = paint(25, Color.rgb(150, 143, 136), false);
        canvas.drawText("Seven.AM Internal Dashboard", 125, 1210, foot);

        File dir = new File(activity.getCacheDir(), "share");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("Không tạo được thư mục chia sẻ");
        }
        File file = new File(dir, "sevenam-pancake-report.png");
        try (FileOutputStream out = new FileOutputStream(file)) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
        bitmap.recycle();

        Uri uri = FileProvider.getUriForFile(
                activity,
                activity.getPackageName() + ".fileprovider",
                file
        );

        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("image/png");
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_TEXT, report);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        activity.startActivity(Intent.createChooser(send, "Chia sẻ báo cáo"));
    }

    private static Paint paint(float size, int color, boolean bold) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTextSize(size);
        p.setColor(color);
        p.setTypeface(android.graphics.Typeface.create(
                "sans-serif",
                bold ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL
        ));
        return p;
    }

    private ReportImageSharer() {}
}
