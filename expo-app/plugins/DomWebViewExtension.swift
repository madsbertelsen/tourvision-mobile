//
//  DomWebViewExtension.swift
//  tourvisionmobile
//
//  Custom extension to add menu items to the native iOS selection menu
//  and hide keyboard accessory view
//

import UIKit
import WebKit
import ObjectiveC

// Custom subclass to hide inputAccessoryView
private class NoAccessoryWKWebView: WKWebView {
    override var inputAccessoryView: UIView? {
        return nil
    }
}

// Extension to customize the edit menu for WKWebView
extension WKWebView {

    // Method to be called during app initialization
    @objc public static func setupKeyboardAccessoryHiding() {
        // Swizzle inputAccessoryView getter to return nil
        guard let originalMethod = class_getInstanceMethod(WKWebView.self, #selector(getter: inputAccessoryView)),
              let swizzledMethod = class_getInstanceMethod(WKWebView.self, #selector(getter: swizzled_inputAccessoryView)) else {
            print("[DomWebViewExtension] Failed to get methods for swizzling inputAccessoryView")
            return
        }

        method_exchangeImplementations(originalMethod, swizzledMethod)
        print("[DomWebViewExtension] Successfully swizzled inputAccessoryView")
    }

    @objc private var swizzled_inputAccessoryView: UIView? {
        // Return nil to hide the accessory view
        return nil
    }

    // Method to swizzle buildMenu for custom menu items
    @objc public static func setupCustomMenu() {
        // Swizzle buildMenu(with:)
        guard let originalMethod = class_getInstanceMethod(WKWebView.self, #selector(buildMenu(with:))),
              let swizzledMethod = class_getInstanceMethod(WKWebView.self, #selector(swizzled_buildMenu(with:))) else {
            print("[DomWebViewExtension] Failed to get methods for swizzling buildMenu")
            return
        }

        method_exchangeImplementations(originalMethod, swizzledMethod)
        print("[DomWebViewExtension] Successfully swizzled buildMenu")
    }

    @objc private func swizzled_buildMenu(with builder: UIMenuBuilder) {
        print("========================================")
        print("[DomWebViewExtension] 🔔 swizzled_buildMenu CALLED!")
        print("[DomWebViewExtension] Builder system: \(builder.system)")
        print("========================================")

        // Call the original buildMenu first (which is now swizzled_buildMenu due to swizzling)
        self.swizzled_buildMenu(with: builder)

        // Add our custom menu items for iOS 16+
        if #available(iOS 16.0, *) {
            let createLocationAction = UIAction(
                title: "Create Location",
                image: UIImage(systemName: "location.circle.fill")
            ) { [weak self] _ in
                print("[DomWebViewExtension] 🎯 Create Location action triggered!")
                self?.handleCreateLocationAction()
            }

            let addNoteAction = UIAction(
                title: "Add Note",
                image: UIImage(systemName: "note.text")
            ) { [weak self] _ in
                print("[DomWebViewExtension] 🎯 Add Note action triggered!")
                self?.handleAddNoteAction()
            }

            let insertMapAction = UIAction(
                title: "Insert Map",
                image: UIImage(systemName: "map.fill")
            ) { [weak self] _ in
                print("[DomWebViewExtension] 🎯 Insert Map action triggered!")
                self?.handleInsertMapAction()
            }

            let customMenu = UIMenu(
                title: "",
                options: .displayInline,
                children: [createLocationAction, addNoteAction, insertMapAction]
            )

            // Insert our custom menu BEFORE the standard edit menu to appear first
            builder.insertSibling(customMenu, beforeMenu: .standardEdit)
            print("[DomWebViewExtension] ✅ Custom menu items added to builder")
        }
    }


    // Handle the "Create Location" action
    private func handleCreateLocationAction() {
        // Get the selected text from the WebView
        self.evaluateJavaScript("""
            (function() {
                const selection = window.getSelection();
                const selectedText = selection.toString();
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                return {
                    text: selectedText,
                    rect: {
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height
                    }
                };
            })()
        """) { result, error in
            if let data = result as? [String: Any],
               let selectedText = data["text"] as? String {
                // Send message to JavaScript to handle the action
                self.sendMessageToJavaScript(action: "createLocation", data: [
                    "selectedText": selectedText,
                    "rect": data["rect"] ?? [:]
                ])
            }
        }
    }

    // Handle the "Add Note" action
    private func handleAddNoteAction() {
        // Get the selected text from the WebView
        self.evaluateJavaScript("window.getSelection().toString()") { result, error in
            if let selectedText = result as? String {
                // Send message to JavaScript to handle the action
                self.sendMessageToJavaScript(action: "addNote", data: [
                    "selectedText": selectedText
                ])
            }
        }
    }

    // Handle the "Insert Map" action
    private func handleInsertMapAction() {
        print("[DomWebViewExtension] 📍 Handling Insert Map action")
        // Send message to JavaScript to insert a map at the current cursor position
        self.sendMessageToJavaScript(action: "insertMap", data: [:])
    }

    // Helper method to send messages to JavaScript
    private func sendMessageToJavaScript(action: String, data: [String: Any]) {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: [
                "source": "nativeMenu",
                "action": action,
                "data": data
            ], options: [])

            if let jsonString = String(data: jsonData, encoding: .utf8) {
                // Escape the JSON string for JavaScript
                let escapedJson = jsonString
                    .replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "\"", with: "\\\"")
                    .replacingOccurrences(of: "\n", with: "\\n")
                    .replacingOccurrences(of: "\r", with: "\\r")

                // Post message to window
                let javascript = """
                    window.postMessage(JSON.parse("\(escapedJson)"), '*');
                """

                self.evaluateJavaScript(javascript) { result, error in
                    if let error = error {
                        print("[DomWebViewExtension] Error sending message to JavaScript: \(error)")
                    } else {
                        print("[DomWebViewExtension] Successfully sent \(action) message to JavaScript")
                    }
                }
            }
        } catch {
            print("[DomWebViewExtension] Error creating JSON message: \(error)")
        }
    }
}
