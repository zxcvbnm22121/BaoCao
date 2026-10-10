package vn.sevenam.pancakedashboard;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Small in-memory thumbnail loader for product images. */
final class ImageCache {
    private static final LruCache<String, Bitmap> CACHE = new LruCache<String, Bitmap>(10 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap value) {
            return value.getByteCount();
        }
    };
    private static final ExecutorService POOL = Executors.newFixedThreadPool(3);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    static void bind(ImageView view, String url) {
        view.setTag(url);
        view.setImageDrawable(null);
        if (url == null || !url.startsWith("https://")) return;
        Bitmap hit = CACHE.get(url);
        if (hit != null) {
            view.setImageBitmap(hit);
            return;
        }
        POOL.execute(() -> {
            Bitmap bmp = fetch(url);
            if (bmp == null) return;
            CACHE.put(url, bmp);
            MAIN.post(() -> {
                if (url.equals(view.getTag())) view.setImageBitmap(bmp);
            });
        });
    }

    private static Bitmap fetch(String url) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            conn.setRequestProperty("User-Agent", "SevenAM-Pancake-Native/3.0");
            if (conn.getResponseCode() != 200) return null;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.RGB_565;
            try (InputStream in = conn.getInputStream()) {
                Bitmap full = BitmapFactory.decodeStream(in, null, opts);
                if (full == null) return null;
                int max = 192;
                if (full.getWidth() <= max && full.getHeight() <= max) return full;
                float scale = Math.min(max / (float) full.getWidth(), max / (float) full.getHeight());
                Bitmap small = Bitmap.createScaledBitmap(full,
                        Math.max(1, Math.round(full.getWidth() * scale)),
                        Math.max(1, Math.round(full.getHeight() * scale)), true);
                if (small != full) full.recycle();
                return small;
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private ImageCache() {}
}
