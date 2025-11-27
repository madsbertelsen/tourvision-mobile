package com.tourvision.tv

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.inputmethod.InputMethodManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ImageView
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

class MainActivity : Activity() {
    companion object {
        private const val TAG = "TourVisionTV"
        private const val BASE_URL = "http://192.168.1.223:5173"
        private const val DOC_ID = "tv-session"
    }

    private lateinit var webView: WebView
    private lateinit var qrCodeImage: ImageView
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        qrCodeImage = findViewById(R.id.qrCodeImage)

        setupWebView()
        setupQrCode()

        val url = "$BASE_URL/doc/$DOC_ID"
        Log.d(TAG, "Loading URL: $url")
        webView.loadUrl(url)
    }

    private fun setupQrCode() {
        val joinUrl = "$BASE_URL/doc/$DOC_ID"
        Log.d(TAG, "Generating QR code for: $joinUrl")

        try {
            val qrCodeWriter = QRCodeWriter()
            val bitMatrix = qrCodeWriter.encode(joinUrl, BarcodeFormat.QR_CODE, 256, 256)
            val width = bitMatrix.width
            val height = bitMatrix.height
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)

            for (x in 0 until width) {
                for (y in 0 until height) {
                    bitmap.setPixel(x, y, if (bitMatrix[x, y]) Color.BLACK else Color.WHITE)
                }
            }

            qrCodeImage.setImageBitmap(bitmap)
            Log.d(TAG, "QR code generated successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate QR code: ${e.message}")
        }
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
        }

        webView.webViewClient = WebViewClient()

        // Add JavaScript interface for keyboard control
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidTV")

        // Log all console messages from WebView for debugging
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                consoleMessage?.let {
                    Log.d(TAG, "[JS] ${it.message()} (${it.sourceId()}:${it.lineNumber()})")
                }
                return true
            }
        }

        Log.d(TAG, "WebView setup complete")
    }

    // JavaScript interface for web-to-native communication
    inner class WebAppInterface(private val context: Context) {
        @JavascriptInterface
        fun showKeyboard() {
            Log.d(TAG, "showKeyboard() called from JavaScript")
            handler.post {
                val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                // toggleSoftInput showed keyboard briefly before - use it
                imm.toggleSoftInput(InputMethodManager.SHOW_FORCED, 0)
                Log.d(TAG, "toggleSoftInput(SHOW_FORCED, 0) called")
            }
        }

        @JavascriptInterface
        fun hideKeyboard() {
            Log.d(TAG, "hideKeyboard() called from JavaScript")
            handler.post {
                val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                imm.hideSoftInputFromWindow(webView.windowToken, 0)
            }
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
