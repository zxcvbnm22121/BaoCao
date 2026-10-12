package vn.sevenam.pancakedashboard;

import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.spec.KeySpec;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Same data path as the web dashboard:
 *  1. "open"  -> Vercel backend (password checked server-side, Pancake key never on the phone)
 *  2. fallback -> encrypted GitHub Pages snapshot decrypted on the phone
 *  3. "range" -> any From/To range, one calendar month per backend call
 */
final class PancakeApi {
    static final String BACKEND = "https://sevenam-pancake-live.vercel.app/api/pancake";
    static final String STATIC_SNAPSHOT = "https://zxcvbnm22121.github.io/BaoCao/data/live.enc";
    private static final int CALL_TIMEOUT_MS = 58_000;

    static DashboardData openLive(String password) throws Exception {
        try {
            JSONObject body = new JSONObject();
            body.put("action", "open");
            return DashboardData.fromJson(post(password, body));
        } catch (Exception backendError) {
            // Backend unavailable: fall back to the encrypted snapshot, like openLiveFast() on the web.
            return fetchStatic(password);
        }
    }

    static DashboardData range(String password, String from, String to) throws Exception {
        List<DashboardData> parts = new ArrayList<>();
        for (String[] chunk : monthChunks(from, to)) {
            JSONObject body = new JSONObject();
            body.put("action", "range");
            body.put("from", chunk[0]);
            body.put("to", chunk[1]);
            parts.add(DashboardData.fromJson(post(password, body)));
        }
        return DashboardData.combine(parts, from, to);
    }

    static List<String[]> monthChunks(String from, String to) {
        List<String[]> chunks = new ArrayList<>();
        LocalDate cursor = LocalDate.parse(from);
        LocalDate end = LocalDate.parse(to);
        while (!cursor.isAfter(end)) {
            LocalDate monthEnd = cursor.withDayOfMonth(cursor.lengthOfMonth());
            LocalDate chunkEnd = monthEnd.isBefore(end) ? monthEnd : end;
            chunks.add(new String[]{cursor.toString(), chunkEnd.toString()});
            cursor = chunkEnd.plusDays(1);
        }
        return chunks;
    }

    private static JSONObject post(String password, JSONObject body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(BACKEND).openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(CALL_TIMEOUT_MS);
            conn.setUseCaches(false);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Cache-Control", "no-store");
            conn.setRequestProperty("X-Dashboard-Password", password);
            conn.setRequestProperty("User-Agent", "SevenAM-Pancake-Native/3.0");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            int code = conn.getResponseCode();
            boolean ok = code >= 200 && code < 300;
            String text = readAll(ok ? conn.getInputStream() : conn.getErrorStream());
            JSONObject json;
            try {
                json = text.isEmpty() ? new JSONObject() : new JSONObject(text);
            } catch (Exception parse) {
                json = new JSONObject();
            }
            if (!ok) {
                String msg = json.optString("error", "");
                if (code == 401 || code == 403) msg = msg.isEmpty() ? "Sai mật khẩu dashboard." : msg;
                throw new IllegalStateException(msg.isEmpty() ? "Backend Pancake " + code : msg);
            }
            return json;
        } finally {
            conn.disconnect();
        }
    }

    static DashboardData fetchStatic(String password) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(
                STATIC_SNAPSHOT + "?ts=" + System.currentTimeMillis()).openConnection();
        String text;
        try {
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(30_000);
            conn.setUseCaches(false);
            conn.setRequestProperty("Cache-Control", "no-cache");
            conn.setRequestProperty("User-Agent", "SevenAM-Pancake-Native/3.0");
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new IllegalStateException("Chưa có bản dữ liệu LIVE dự phòng (" + code + ")");
            }
            text = readAll(conn.getInputStream());
        } finally {
            conn.disconnect();
        }
        try {
            return DashboardData.fromJson(new JSONObject(decrypt(new JSONObject(text), password)));
        } catch (AEADBadTagException badPassword) {
            throw new IllegalStateException("Sai mật khẩu dashboard.");
        }
    }

    private static String decrypt(JSONObject env, String password) throws Exception {
        byte[] salt = Base64.decode(env.getString("salt"), Base64.DEFAULT);
        byte[] iv = Base64.decode(env.getString("iv"), Base64.DEFAULT);
        byte[] encrypted = Base64.decode(env.getString("data"), Base64.DEFAULT);
        int iterations = env.optInt("iterations", 210_000);

        SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
        KeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, 256);
        SecretKey key = new SecretKeySpec(factory.generateSecret(spec).getEncoded(), "AES");

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    private static String readAll(InputStream in) throws Exception {
        if (in == null) return "";
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = stream.read(buf)) != -1) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private PancakeApi() {}
}
