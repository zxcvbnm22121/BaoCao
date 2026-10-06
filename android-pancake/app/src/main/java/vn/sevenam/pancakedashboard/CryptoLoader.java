package vn.sevenam.pancakedashboard;

import android.util.Base64;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.spec.KeySpec;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

final class CryptoLoader {
    private static final String LIVE_URL =
            "https://zxcvbnm22121.github.io/BaoCao/data/live.enc";

    static DashboardData load(String password) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(
                LIVE_URL + "?ts=" + System.currentTimeMillis()
        ).openConnection();
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(30_000);
        conn.setUseCaches(false);
        conn.setRequestProperty("Cache-Control", "no-cache");
        conn.setRequestProperty("User-Agent", "SevenAM-Pancake-Native/2.0");

        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            conn.disconnect();
            throw new IllegalStateException("Không tải được dữ liệu LIVE (" + code + ")");
        }

        StringBuilder body = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
        } finally {
            conn.disconnect();
        }

        JSONObject env = new JSONObject(body.toString());
        byte[] salt = Base64.decode(env.getString("salt"), Base64.DEFAULT);
        byte[] iv = Base64.decode(env.getString("iv"), Base64.DEFAULT);
        byte[] encrypted = Base64.decode(env.getString("data"), Base64.DEFAULT);
        int iterations = env.optInt("iterations", 210_000);

        SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
        KeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, 256);
        SecretKey derived = factory.generateSecret(spec);
        SecretKey key = new SecretKeySpec(derived.getEncoded(), "AES");

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
        byte[] plain = cipher.doFinal(encrypted);

        return DashboardData.fromJson(
                new JSONObject(new String(plain, StandardCharsets.UTF_8))
        );
    }

    private CryptoLoader() {}
}
